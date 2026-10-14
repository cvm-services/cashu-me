/**
 * ContextVM (CVM) client — MCP JSON-RPC over Nostr.
 *
 * How it talks to a CVM (verified against the reference client
 * `repos/nosms/scripts/cvm_live_verify.py:147-160` and the live server
 * `repos/nosms/app/cvm_tools.py`):
 *
 *   1. Build an MCP JSON-RPC request.
 *   2. Put it in a kind-25910 rumor tagged `["p", <server pubkey>]`.
 *   3. NIP-59 gift-wrap it: seal (kind 13, signed by us, NIP-44 to server),
 *      wrap (kind 1059, signed by a throwaway key, NIP-44 to server).
 *   4. Publish to the relays; poll received wraps for a reply whose JSON-RPC
 *      `id` matches the request.
 *
 * Payment is CEP-8 `explicit_gating`: an unpaid `sms.send` answers
 * `payment_required` and nothing is sent. The accepted PMI is a Cashu token,
 * which the server swaps at the mint so value is genuinely held.
 */
import {
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
  nip44,
  SimplePool,
  type Event,
} from "nostr-tools";

export type JsonRpcReply = {
  jsonrpc?: string;
  id?: string | number;
  result?: {
    content?: Array<{ type?: string; text?: string }>;
    isError?: boolean;
    [k: string]: unknown;
  };
  error?: { code?: number; message?: string };
};

/** The shape a CVM's tool error carries once parsed out of the MCP envelope. */
export type CvmToolError = {
  reason: string;
  hint?: string;
  [k: string]: unknown;
};

export const CTXVM_MESSAGE_KIND = 25910;

export type CvmClientOptions = {
  /** Server pubkey, hex. */
  serverPubkey: string;
  /** Client secret key, hex. Signs the rumor's seal and decrypts replies. */
  secretKey: string;
  relays: string[];
  /** How long to wait for a reply, ms. Reference client uses a polling loop. */
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 45_000;
const REPLY_POLL_MS = 400;

/** Decode one gift wrap addressed to us and return the inner kind-25910 event. */
export function unwrapGiftWrap(
  wrap: Event,
  recipientSecret: string
): Event | null {
  try {
    // wrap.content is NIP-44 to us, from the wrap's (throwaway) pubkey
    const sealJson = nip44.v2.decrypt(
      wrap.content,
      nip44.v2.utils.getConversationKey(recipientSecret, wrap.pubkey)
    );
    const seal = JSON.parse(sealJson) as Event;
    if (seal.kind !== 13) return null;
    const rumorJson = nip44.v2.decrypt(
      seal.content,
      nip44.v2.utils.getConversationKey(recipientSecret, seal.pubkey)
    );
    const rumor = JSON.parse(rumorJson) as Event;
    if (rumor.kind !== CTXVM_MESSAGE_KIND) return null;
    return rumor;
  } catch {
    // Not for us, or not a wrap we can read. Never throw on a relay's noise.
    return null;
  }
}

/**
 * Gift-wrap `content` addressed to `recipientPubkey`.
 *
 * Three layers, matching NIP-17/NIP-59 and the reference client
 * (`cvm_live_verify.py:152-154` builds a kind-25910 rumor then gift-wraps it):
 *
 *   rumor kind 25910  (unsigned — the JSON-RPC body; the seal authenticates it)
 *     └ seal kind 13  (signed by us, NIP-44 to the recipient)
 *         └ wrap kind 1059 (signed by a throwaway key, tagged to the recipient)
 */
export function giftWrap(
  content: string,
  recipientPubkey: string,
  secretKey: string
): Event {
  const senderPubkey = getPublicKey(secretKey);
  const now = Math.floor(Date.now() / 1000);

  // Layer 1 — the rumor: kind 25910 carrying the JSON-RPC request. Deliberately
  // unsigned; it is never published on its own.
  const rumor = {
    kind: CTXVM_MESSAGE_KIND,
    created_at: now,
    tags: [],
    content,
    pubkey: senderPubkey,
  };

  // Layer 2 — the seal: kind 13, signed by the real sender, NIP-44 to the recipient.
  const seal = finalizeEvent(
    {
      kind: 13,
      created_at: now,
      tags: [],
      content: nip44.v2.encrypt(
        JSON.stringify(rumor),
        nip44.v2.utils.getConversationKey(secretKey, recipientPubkey)
      ),
    },
    secretKey
  );

  // Layer 3 — the wrap: kind 1059, signed by a throwaway key, tagged to the
  // recipient. The real author lives only inside the seal.
  const throwaway = generateSecretKey();
  const throwawayHex = Array.from(throwaway)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const wrap = finalizeEvent(
    {
      kind: 1059,
      created_at: now,
      tags: [["p", recipientPubkey]],
      content: nip44.v2.encrypt(
        JSON.stringify(seal),
        nip44.v2.utils.getConversationKey(throwawayHex, recipientPubkey)
      ),
    },
    throwaway
  );
  return wrap;
}

export class CvmClient {
  private pool: SimplePool;
  private opts: Required<CvmClientOptions>;

  constructor(options: CvmClientOptions) {
    this.opts = { timeoutMs: DEFAULT_TIMEOUT_MS, ...options };
    this.pool = new SimplePool();
  }

  /**
   * Call an MCP tool. Resolves with the raw JSON-RPC reply, or throws if no
   * reply arrived in time — a caller that cannot see a refusal cannot tell it
   * from an unreachable server, so silence is an error, never a success.
   */
  async call(
    tool: string,
    args: Record<string, unknown> = {},
    method: "tools/call" | "initialize" = "tools/call"
  ): Promise<JsonRpcReply> {
    const id = `${tool}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const params =
      method === "tools/call" ? { name: tool, arguments: args } : args;
    const request = { jsonrpc: "2.0", id, method, params };

    const replies = new Map<string, JsonRpcReply>();
    const sub = this.pool.subscribeMany(
      this.opts.relays,
      { kinds: [1059], "#p": [getPublicKey(this.opts.secretKey)] },
      {
        onevent: (event: Event) => {
          const rumor = unwrapGiftWrap(event, this.opts.secretKey);
          if (!rumor) return;
          try {
            const reply = JSON.parse(rumor.content) as JsonRpcReply;
            if (reply && reply.id !== undefined)
              replies.set(String(reply.id), reply);
          } catch {
            /* ignore undecodable payloads */
          }
        },
      }
    );

    const wrap = giftWrap(
      JSON.stringify(request),
      this.opts.serverPubkey,
      this.opts.secretKey
    );

    try {
      await Promise.any(this.pool.publish(this.opts.relays, wrap));

      const started = Date.now();
      while (Date.now() - started < this.opts.timeoutMs) {
        const hit = replies.get(id);
        if (hit) return hit;
        await new Promise((r) => setTimeout(r, REPLY_POLL_MS));
      }
      throw new Error(
        `No reply from the CVM within ${this.opts.timeoutMs} ms (tool ${tool}).`
      );
    } finally {
      sub.close();
      this.pool.close(this.opts.relays);
    }
  }

  close() {
    this.pool.close(this.opts.relays);
  }
}

/** The text payload of an MCP tool result, or "" when there is none. */
export function replyText(reply: JsonRpcReply): string {
  const blocks = reply.result?.content ?? [];
  return blocks.length ? String(blocks[0]?.text ?? "") : "";
}

/**
 * Parse a tool payload. Returns `{ ok: true, data }` for a result, or
 * `{ ok: false, error }` when the CVM refused — the refusal is data, not an
 * exception, so the UI can render the honest reason.
 */
export function parseToolPayload<T = Record<string, unknown>>(
  reply: JsonRpcReply
): { ok: true; data: T } | { ok: false; error: CvmToolError } {
  const text = replyText(reply);
  let payload: Record<string, unknown> = {};
  if (text) {
    try {
      payload = JSON.parse(text) as Record<string, unknown>;
    } catch {
      payload = { hint: text };
    }
  }
  if (reply.result?.isError) {
    return {
      ok: false,
      error: {
        reason: String(payload.reason ?? "tool_error"),
        ...payload,
      },
    };
  }
  return { ok: true, data: payload as T };
}
