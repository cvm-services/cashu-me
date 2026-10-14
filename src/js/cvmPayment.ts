/**
 * Services pay step — the Cashu side of the ContextVM SMS flow.
 *
 * `src/js/cvm.ts` is the transport (gift-wrapped MCP JSON-RPC). This module is
 * the *payment* half: it decides whether the user can pay at all, reads the
 * live price from the CVM (never from the catalogue copy), builds the token,
 * and turns the reply into an honest result the UI can render.
 *
 * Everything here is pure or dependency-injected on purpose: the ServicesPage
 * is Quasar-heavy and mounts empty in this repo's vitest harness, so the
 * decisions live out here where they can be tested directly.
 *
 * The one hard rule: this rail reports `best_effort: true` and
 * `delivery_receipts: false`. A successful `sms.send` means the rail ACCEPTED
 * the message. It does not mean it was delivered, and nothing here may claim
 * otherwise.
 */
import { nip19 } from "nostr-tools";
import {
  parseToolPayload,
  type JsonRpcReply,
  type CvmToolError,
} from "src/js/cvm";

/** The npub the SMS service is published under (public/catalog.json). */
export const SERVICE_NPUB =
  "npub1yfd2zvsq3lmz7n6ckjt77rm0a56s3d49n2xvpc0ct2tzx24c4wuqn4h6hf";

/**
 * Relays the service itself reads + writes (repos/nosms/app/cvm.py
 * WORKING_RELAYS). Deliberately fixed: a relay the server does not subscribe
 * to can carry the request but never the reply.
 */
export const SERVICE_RELAYS = [
  "wss://relay.contextvm.org",
  "wss://relay2.contextvm.org",
  "wss://relay.primal.net",
];

/** Documented flat price, used only when the live rail cannot be reached. */
export const FALLBACK_PRICE_SATS = 2900;

/** Where the wire format is defined — cited so a reader can go and check. */
export const CVM_READY_STATE_SOURCE =
  "repos/nosms/scripts/cvm_live_verify.py:150-163 (call) + repos/nosms/app/cvm_tools.py:319 (sms_send)";

// The mint the service escrows against (NOSMS_MINT_URL, default below).
// A token from any other mint is refused `token_wrong_mint`, so it is checked
// before any money moves. This IS the live deployment value: the CVM on
// CobradorWave runs with NOSMS_MINT_URL=https://mint-test.orangesync.tech
// (micronuts, Caddy+CORS in front). `token_wrong_mint` is a STRING comparison,
// so this constant and the server's env var must match byte for byte.
export const SERVICE_MINT_URL = "https://mint-test.orangesync.tech";

export type PayErrorKey =
  | "services.payErrors.noWallet"
  | "services.payErrors.noMint"
  | "services.payErrors.wrongMint"
  | "services.payErrors.insufficientFunds"
  | "services.payErrors.refused"
  | "services.payErrors.spent"
  | "services.payErrors.badNumber"
  | "services.payErrors.paced"
  | "services.payErrors.railDown"
  | "services.payErrors.unreachable"
  | "services.payErrors.generic";

export type PaidSendResult = {
  ok: boolean;
  /** Whether the rail ACCEPTED the message (not whether it was delivered). */
  accepted: boolean;
  /** The rail's own honesty flag: no delivery guarantee. */
  bestEffort: boolean;
  /**
   * Always false on this rail. Computed, never trusted from the reply — a
   * best-effort rail cannot observe delivery, so a `true` is downgraded.
   */
  deliveryConfirmed: false;
  /** Record id, usable with `sms.status`. */
  id?: string;
  status?: string;
  priceSats?: number;
  refunded: boolean;
  refundToken?: string;
  /** i18n key for the failure, when `ok` is false. */
  errorKey?: PayErrorKey;
  /** The machine reason the rail gave, for display + logs. */
  reason?: string;
  /** Free-text detail (e.g. the client's timeout message). */
  detail?: string;
};

/** Convert an npub (or a raw hex pubkey) to the hex form the CVM expects. */
export function npubToHex(npubOrHex: string): string {
  const value = (npubOrHex || "").trim();
  if (/^[0-9a-fA-F]{64}$/.test(value)) return value.toLowerCase();
  if (value.startsWith("npub1")) {
    const decoded = nip19.decode(value);
    if (decoded.type === "npub") return decoded.data as string;
  }
  throw new Error("SERVICE_PUBKEY must be an npub1… or a 64-char hex pubkey.");
}

/** The `sms.send` argument object, per the live contract. */
export function buildSmsSendArgs(
  to: string,
  body: string,
  cashuToken?: string
): Record<string, string> {
  const args: Record<string, string> = { to, body };
  // `cashu_token` is the contract field (app/cvm_tools.py:319). Empty/undefined
  // means the unpaid probe, which must come back as `payment_required`.
  if (cashuToken) args.cashu_token = cashuToken;
  return args;
}

/**
 * Resolve the price to pay. The rail's live `sms.pricing` is authoritative;
 * the CEP-8 `cap` is honoured when present. Only an unreachable rail falls
 * back to the documented flat price — and that is flagged, not hidden.
 */
export function resolvePayPrice(
  pricing:
    | { ok: true; data: Record<string, unknown> }
    | { ok: false; error: CvmToolError }
    | undefined
): { sats: number; source: "live" | "fallback" } {
  if (pricing && pricing.ok) {
    const cap = String(pricing.data.cap ?? "");
    const capMatch = cap.match(/cap:tool:sms\.send:(\d+):sats/);
    const live = Number(
      capMatch
        ? capMatch[1]
        : pricing.data.price ?? pricing.data.price_sats ?? 0
    );
    if (Number.isFinite(live) && live > 0)
      return { sats: live, source: "live" };
  }
  return { sats: FALLBACK_PRICE_SATS, source: "fallback" };
}

/** Can the wallet even attempt a payment? Checked before any network call. */
export function pickPaymentSource(wallet: {
  hasSeed: boolean;
  mintsCount: number;
}): { ok: true } | { ok: false; errorKey: PayErrorKey } {
  if (!wallet.hasSeed) {
    return { ok: false, errorKey: "services.payErrors.noWallet" };
  }
  if (!wallet.mintsCount) {
    return { ok: false, errorKey: "services.payErrors.noMint" };
  }
  return { ok: true };
}

/** True when one of the user's mints is the mint the service escrows against. */
export function hasAddressableMint(
  connectedMintUrls: string[],
  serviceMintUrl: string = SERVICE_MINT_URL
): boolean {
  const target = serviceMintUrl.replace(/\/+$/, "");
  return connectedMintUrls.some(
    (url) => (url || "").replace(/\/+$/, "") === target
  );
}

const ERROR_KEY_BY_REASON: Record<string, PayErrorKey> = {
  payment_required: "services.payErrors.refused",
  insufficient_funds: "services.payErrors.insufficientFunds",
  token_wrong_mint: "services.payErrors.wrongMint",
  token_already_spent: "services.payErrors.spent",
  token_state_unknown: "services.payErrors.spent",
  bad_destination: "services.payErrors.badNumber",
  destination_unsupported: "services.payErrors.badNumber",
  rail_paced: "services.payErrors.paced",
  rate_limited: "services.payErrors.paced",
  rail_unavailable: "services.payErrors.railDown",
  transport_error: "services.payErrors.railDown",
  unreachable: "services.payErrors.unreachable",
};

/** Map a machine reason onto an i18n key, keeping the reason for display. */
export function mapCvmError(
  reason: string,
  detail?: string
): { errorKey: PayErrorKey; reason: string; detail?: string } {
  return {
    errorKey: ERROR_KEY_BY_REASON[reason] ?? "services.payErrors.generic",
    reason,
    detail,
  };
}

const str = (v: unknown): string | undefined =>
  v === undefined || v === null ? undefined : String(v);
const bool = (v: unknown): boolean => v === true;

/**
 * Turn a parsed CVM payload into the honest result the UI renders.
 *
 * A success envelope is not proof of delivery. `delivery_confirmed` is forced
 * to false here, so no future server change, typo, or optimistic payload can
 * make the UI lie about a rail that has no receipts.
 */
export function readCvmResult(
  outcome:
    | { ok: true; reply: JsonRpcReply }
    | { ok: false; error: CvmToolError }
): PaidSendResult {
  if (!outcome.ok) {
    const mapped = mapCvmError(outcome.error.reason, str(outcome.error.hint));
    return {
      ok: false,
      accepted: false,
      bestEffort: true,
      deliveryConfirmed: false,
      refunded: false,
      priceSats:
        outcome.error.price_sats === undefined
          ? undefined
          : Number(outcome.error.price_sats),
      errorKey: mapped.errorKey,
      reason: mapped.reason,
      detail: mapped.detail,
    };
  }

  const payload = (
    outcome.reply.result?.content?.[0]?.text
      ? JSON.parse(outcome.reply.result.content[0].text)
      : {}
  ) as Record<string, unknown>;

  const accepted = bool(payload.accepted);
  return {
    ok: accepted,
    accepted,
    bestEffort:
      payload.best_effort === undefined ? true : bool(payload.best_effort),
    // THE honesty rule: computed false, never read from the payload.
    deliveryConfirmed: false,
    id: str(payload.id),
    status: str(payload.status),
    priceSats:
      payload.price_sats === undefined ? undefined : Number(payload.price_sats),
    refunded: bool(payload.refunded),
    refundToken: str(payload.refund_token),
    // A send the rail refused to accept still needs a key so the UI can say why.
    errorKey: accepted ? undefined : "services.payErrors.refused",
    reason: accepted ? undefined : str(payload.reason) ?? "not_accepted",
  };
}

/** Minimal shape of the CVM client that `payForSms` depends on. */
type CvmCaller = {
  call(tool: string, args: Record<string, unknown>): Promise<JsonRpcReply>;
};

export type PayForSmsInput = {
  /** The CVM transport (injected so this can be tested without relays). */
  client: CvmCaller;
  /**
   * Mints a token worth `sats` from the user's wallet and returns its
   * `cashuA…`/`cashuB…` encoding. Injected so tests never touch a mint.
   * Throws when the balance is too low.
   */
  mintToken: (opts: {
    sats: number;
  }) => Promise<{ token: string; sats: number }>;
  to: string;
  body: string;
  wallet: { hasSeed: boolean; mintsCount: number };
  /** URLs of the mints the user is actually connected to. */
  connectedMintUrls: string[];
  /** Overridable so a deployment can point at its own escrow mint. */
  serviceMintUrl?: string;
};

/**
 * The whole pay step, in order, with the money-moving step last:
 *
 *   1. can the wallet pay at all (seed + mint)?
 *   2. what does the rail charge *right now*?
 *   3. is the user's mint the one the service escrows against?
 *   4. mint exactly the price from the wallet
 *   5. send with `cashu_token`; surface the honest result
 *
 * Nothing is minted until steps 1–3 pass, so no sats move for a token the
 * service would refuse.
 */
export async function payForSms(
  input: PayForSmsInput
): Promise<PaidSendResult> {
  const { client, mintToken, to, body, wallet, connectedMintUrls } = input;
  const serviceMintUrl = input.serviceMintUrl ?? SERVICE_MINT_URL;

  const source = pickPaymentSource(wallet);
  if (!source.ok) {
    return {
      ok: false,
      accepted: false,
      bestEffort: true,
      deliveryConfirmed: false,
      refunded: false,
      errorKey: source.errorKey,
    };
  }

  // 2. Live price. A thrown call means no reply arrived — unreachable, not
  //    refused. Silence must never read as success.
  let pricingPayload:
    | { ok: true; data: Record<string, unknown> }
    | { ok: false; error: CvmToolError }
    | undefined;
  try {
    const reply = await client.call("sms.pricing", { to });
    const text = reply.result?.content?.[0]?.text;
    const data = text
      ? (JSON.parse(String(text)) as Record<string, unknown>)
      : {};
    pricingPayload = { ok: true, data };
  } catch (error: any) {
    if (isClientTimeout(error)) {
      return unreachable(error);
    }
    pricingPayload = undefined;
  }
  const price = resolvePayPrice(pricingPayload);

  // 3. Escrow mint. Refuse before minting rather than pay for a token the
  //    service will hand back as `token_wrong_mint`.
  if (!hasAddressableMint(connectedMintUrls, serviceMintUrl)) {
    return {
      ok: false,
      accepted: false,
      bestEffort: true,
      deliveryConfirmed: false,
      refunded: false,
      errorKey: "services.payErrors.wrongMint",
      detail: serviceMintUrl,
    };
  }

  // 4. Mint exactly the price (plus the mint's own input fee is the caller's
  //    concern — the server reports `insufficient_funds` with the shortfall).
  let token: string;
  try {
    const minted = await mintToken({ sats: price.sats });
    token = minted.token;
  } catch (error: any) {
    return {
      ok: false,
      accepted: false,
      bestEffort: true,
      deliveryConfirmed: false,
      refunded: false,
      errorKey: "services.payErrors.insufficientFunds",
      detail: error?.message ?? String(error),
    };
  }

  // 5. Send with the token.
  let reply: JsonRpcReply;
  try {
    reply = await client.call("sms.send", buildSmsSendArgs(to, body, token));
  } catch (error: any) {
    return unreachable(error);
  }

  // The refusal is data, not an exception — reuse the shared parser so the
  // page and the client agree on what an error payload looks like.
  const parsed = parseToolPayload(reply);
  return readCvmResult(
    parsed.ok ? { ok: true, reply } : { ok: false, error: parsed.error }
  );
}

/** True when the failure is the client's own "no reply in time" error. */
function isClientTimeout(error: any): boolean {
  return /No reply from the CVM within/.test(String(error?.message ?? error));
}

function unreachable(error: any): PaidSendResult {
  const mapped = mapCvmError("unreachable", String(error?.message ?? error));
  return {
    ok: false,
    accepted: false,
    bestEffort: true,
    deliveryConfirmed: false,
    refunded: false,
    errorKey: mapped.errorKey,
    reason: mapped.reason,
    detail: mapped.detail,
  };
}
