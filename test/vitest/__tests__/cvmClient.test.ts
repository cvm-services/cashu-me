import { describe, expect, it } from "vitest";

// The CVM transport is a gift-wrapped JSON-RPC channel. These tests exercise the
// crypto round-trip and the MCP envelope parsing — the two things that silently
// break and make every paid call fail. No network: the wrap/unwrap is local.

// node:crypto is used by nostr-tools; give the module the global it expects.
import { webcrypto } from "node:crypto";
if (!(globalThis as any).crypto) {
  (globalThis as any).crypto = webcrypto as unknown as Crypto;
}

import { generateSecretKey, getPublicKey } from "nostr-tools";
import {
  CTXVM_MESSAGE_KIND,
  giftWrap,
  unwrapGiftWrap,
  parseToolPayload,
  replyText,
} from "src/js/cvm";

const hex = (b: Uint8Array) =>
  Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");

describe("CVM gift wrap (NIP-59)", () => {
  it("round-trips a JSON-RPC request to the server and back", () => {
    const serverSk = hex(generateSecretKey());
    const clientSk = hex(generateSecretKey());
    const serverPk = getPublicKey(serverSk as unknown as Uint8Array);
    void clientSk;

    const request = { jsonrpc: "2.0", id: "sms.pricing-1", method: "tools/call",
      params: { name: "sms.pricing", arguments: {} } };

    // client -> server
    const wrap = giftWrap(JSON.stringify(request), serverPk, clientSk);
    expect(wrap.kind).toBe(1059);
    expect(wrap.tags).toEqual([["p", serverPk]]);

    const inner = unwrapGiftWrap(wrap, serverSk);
    expect(inner).not.toBeNull();
    expect(inner!.kind).toBe(CTXVM_MESSAGE_KIND);
    expect(JSON.parse(inner!.content)).toEqual(request);
  });

  it("leaves the real author only inside the seal, not on the wrap", async () => {
    const serverSk = hex(generateSecretKey());
    const clientSk = hex(generateSecretKey());
    const clientPk = getPublicKey(clientSk as unknown as Uint8Array);
    const serverPk = getPublicKey(serverSk as unknown as Uint8Array);

    const wrap = giftWrap("payload", serverPk, clientSk);
    // the wrap is signed by a throwaway key, so it must not expose the sender
    expect(wrap.pubkey).not.toBe(clientPk);

    const { nip44 } = await import("nostr-tools");
    const seal = JSON.parse(
      nip44.v2.decrypt(
        wrap.content,
        nip44.v2.utils.getConversationKey(serverSk, wrap.pubkey)
      )
    );
    expect(seal.pubkey).toBe(clientPk);
  });

  it("returns null rather than throwing on a wrap it cannot read", () => {
    const otherSk = hex(generateSecretKey());
    const serverSk = hex(generateSecretKey());
    const serverPk = getPublicKey(serverSk as unknown as Uint8Array);
    const wrap = giftWrap("for someone else", serverPk, otherSk);
    // a third party (not the recipient) must get a clean null
    const thirdParty = hex(generateSecretKey());
    expect(unwrapGiftWrap(wrap, thirdParty)).toBeNull();
  });
});

describe("MCP envelope parsing", () => {
  it("reads a successful tool payload", () => {
    const reply = {
      jsonrpc: "2.0",
      id: "1",
      result: { content: [{ type: "text", text: JSON.stringify({ price_sats: 2900 }) }] },
    };
    expect(replyText(reply)).toContain("2900");
    const parsed = parseToolPayload<{ price_sats: number }>(reply);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.data.price_sats).toBe(2900);
  });

  it("surfaces a refusal as data carrying its reason, not as a success", () => {
    const reply = {
      jsonrpc: "2.0",
      id: "2",
      result: {
        isError: true,
        content: [
          {
            type: "text",
            text: JSON.stringify({
              reason: "payment_required",
              hint: "attach a Cashu token",
              price_sats: 2900,
            }),
          },
        ],
      },
    };
    const parsed = parseToolPayload(reply);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error.reason).toBe("payment_required");
      expect(parsed.error.price_sats).toBe(2900);
    }
  });
});
