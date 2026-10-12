import { describe, expect, it, vi } from "vitest";

// The Services pay step is the one place where "the user pressed pay" has to
// become real sats. The component around it is Quasar-heavy (its mount returns
// empty HTML in this repo's harness), so the logic that decides *what* happens
// is extracted into `src/js/cvmPayment` and verified here directly — the same
// approach the CVM client itself uses.
//
// These are contract tests against the live nosms CVM contract
// (repos/nosms/docs/cvm/llms.txt + app/cvm_tools.py):
//   * sms.send params are `to`, `body`, `cashu_token` — NOT `message`.
//   * an unpaid call comes back as an isError refusal with
//     `{reason: "payment_required", cap, price_sats}`.
//   * price is read live from sms.pricing, never hardcoded from the catalog.

import {
  CVM_READY_STATE_SOURCE,
  SERVICE_NPUB,
  SERVICE_MINT_URL,
  SERVICE_RELAYS,
  buildSmsSendArgs,
  hasAddressableMint,
  mapCvmError,
  npubToHex,
  pickPaymentSource,
  readCvmResult,
  resolvePayPrice,
} from "src/js/cvmPayment";

describe("npubToHex", () => {
  it("converts the live catalog npub to the hex pubkey the CVM needs", () => {
    // The catalog carries an npub; the wire format is a hex pubkey.
    expect(npubToHex(SERVICE_NPUB)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("passes an already-hex pubkey through untouched", () => {
    const hex = "a".repeat(64);
    expect(npubToHex(hex)).toBe(hex);
  });

  it("rejects anything that is neither npub nor hex", () => {
    expect(() => npubToHex("not-a-key")).toThrow(/npub/);
    expect(() => npubToHex("")).toThrow(/npub/);
  });
});

describe("SERVICE_RELAYS", () => {
  it("targets the relay set the service actually publishes to", () => {
    // From repos/nosms/app/cvm.py WORKING_RELAYS — hardcoding these is a
    // feature: a relay the server does not read cannot deliver a reply.
    expect(SERVICE_RELAYS).toContain("wss://relay.contextvm.org");
    expect(SERVICE_RELAYS).toContain("wss://relay2.contextvm.org");
    expect(SERVICE_RELAYS).toContain("wss://relay.primal.net");
  });
});

describe("buildSmsSendArgs", () => {
  it("uses the contract's `body` field and attaches the cashu token", () => {
    const args = buildSmsSendArgs("+14155550100", "hello", "cashuAxyz");
    expect(args).toEqual({
      to: "+14155550100",
      body: "hello",
      cashu_token: "cashuAxyz",
    });
    // `message` is the field name a naive implementation guesses; the server
    // requires `body`, so guard against a regression.
    expect(args).not.toHaveProperty("message");
  });

  it("omits cashu_token for the unpaid pricing probe", () => {
    const args = buildSmsSendArgs("+14155550100", "hello");
    expect(args).not.toHaveProperty("cashu_token");
    expect(args.body).toBe("hello");
  });
});

describe("resolvePayPrice", () => {
  it("takes the live rail price from sms.pricing", () => {
    const price = resolvePayPrice({
      ok: true,
      data: { price: 2900, price_sats: 2900, cap: "cap:tool:sms.send:2900:sats" },
    });
    expect(price).toEqual({ sats: 2900, source: "live" });
  });

  it("honours the CEP-8 cap when the rail quotes one", () => {
    const price = resolvePayPrice({
      ok: true,
      data: { cap: "cap:tool:sms.send:3100:sats" },
    });
    expect(price.sats).toBe(3100);
    expect(price.source).toBe("live");
  });

  it("falls back to the documented flat price when the rail is unreachable", () => {
    const price = resolvePayPrice(undefined);
    expect(price).toEqual({ sats: 2900, source: "fallback" });
  });
});

describe("pickPaymentSource", () => {
  const wallet = (over: Record<string, unknown> = {}) => ({
    hasSeed: true,
    mintsCount: 1,
    ...over,
  });

  it("refuses without a wallet seed", () => {
    expect(pickPaymentSource(wallet({ hasSeed: false }))).toEqual({
      ok: false,
      errorKey: "services.payErrors.noWallet",
    });
  });

  it("refuses without a connected mint", () => {
    expect(pickPaymentSource(wallet({ mintsCount: 0 }))).toEqual({
      ok: false,
      errorKey: "services.payErrors.noMint",
    });
  });

  it("proceeds when the wallet has a seed and a mint", () => {
    expect(pickPaymentSource(wallet())).toEqual({ ok: true });
  });
});

describe("hasAddressableMint", () => {
  it("is true when the user holds the service's mint", () => {
    expect(hasAddressableMint([SERVICE_MINT_URL])).toBe(true);
  });

  it("is false when the token would be refused as token_wrong_mint", () => {
    expect(hasAddressableMint(["https://mint.minibits.cash/Bitcoin"])).toBe(
      false
    );
  });
});

describe("mapCvmError", () => {
  const errorKeys: Record<string, string> = {
    payment_required: "services.payErrors.refused",
    insufficient_funds: "services.payErrors.insufficientFunds",
    token_wrong_mint: "services.payErrors.wrongMint",
    token_already_spent: "services.payErrors.spent",
    bad_destination: "services.payErrors.badNumber",
    destination_unsupported: "services.payErrors.badNumber",
    rail_paced: "services.payErrors.paced",
    rail_unavailable: "services.payErrors.railDown",
    unreachable: "services.payErrors.unreachable",
  };

  it.each(Object.entries(errorKeys))("maps %s to %s", (reason, key) => {
    const mapped = mapCvmError(reason);
    expect(mapped.errorKey).toBe(key);
    // Every mapped refusal keeps the machine reason so the UI can show it.
    expect(mapped.reason).toBe(reason);
  });

  it("maps an unknown reason to a generic refusal, never to success", () => {
    const mapped = mapCvmError("something_new");
    expect(mapped.errorKey).toBe("services.payErrors.generic");
    expect(mapped.reason).toBe("something_new");
  });

  it("maps an unreachable CVM to its own reason, not to a refusal", () => {
    const mapped = mapCvmError("unreachable", "no reply in 45000 ms");
    expect(mapped.errorKey).toBe("services.payErrors.unreachable");
    expect(mapped.detail).toContain("no reply");
  });
});

describe("readCvmResult", () => {
  const paidReply = (payload: Record<string, unknown>) => ({
    jsonrpc: "2.0",
    id: "sms.send-1",
    result: { content: [{ type: "text", text: JSON.stringify(payload) }] },
  });

  it("reports a paid send honestly — accepted, best effort, NOT delivered", () => {
    const result = readCvmResult({
      ok: true,
      reply: paidReply({
        id: "snd_abc",
        to: "+14155550100",
        price_sats: 2900,
        accepted: true,
        best_effort: true,
        delivery_confirmed: false,
        status: "queued",
        refunded: false,
      }),
    });
    expect(result.ok).toBe(true);
    expect(result.accepted).toBe(true);
    expect(result.bestEffort).toBe(true);
    // THE honesty requirement: this rail has no delivery receipts.
    expect(result.deliveryConfirmed).toBe(false);
    expect(result.id).toBe("snd_abc");
    expect(result.refunded).toBe(false);
  });

  it("never claims delivery even if a reply tries to assert it", () => {
    // A best-effort rail cannot observe delivery; anything claiming otherwise
    // is downgraded rather than surfaced as truth.
    const result = readCvmResult({
      ok: true,
      reply: paidReply({ accepted: true, best_effort: true, delivery_confirmed: true }),
    });
    expect(result.deliveryConfirmed).toBe(false);
  });

  it("surfaces a refusal with its reason and the rail's price", () => {
    const result = readCvmResult({
      ok: false,
      error: { reason: "payment_required", price_sats: 2900 },
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("payment_required");
    expect(result.errorKey).toBe("services.payErrors.refused");
    expect(result.priceSats).toBe(2900);
  });

  it("surfaces a refunded send as not delivered but money returned", () => {
    const result = readCvmResult({
      ok: true,
      reply: paidReply({
        accepted: false,
        best_effort: true,
        delivery_confirmed: false,
        refunded: true,
        refund_token: "cashuBrefund",
      }),
    });
    expect(result.accepted).toBe(false);
    expect(result.refunded).toBe(true);
    expect(result.deliveryConfirmed).toBe(false);
  });

  it("treats an unreachable CVM as an honest failure with no send", () => {
    const result = readCvmResult({
      ok: false,
      error: { reason: "unreachable", hint: "No reply from the CVM within 45000 ms" },
    });
    expect(result.ok).toBe(false);
    expect(result.errorKey).toBe("services.payErrors.unreachable");
    expect(result.accepted).toBe(false);
  });
});

describe("the source that is exposed to the test harness", () => {
  it("mirrors the live contract npub + relays the page is wired to", () => {
    expect(SERVICE_NPUB).toBe(
      "npub1yfd2zvsq3lmz7n6ckjt77rm0a56s3d49n2xvpc0ct2tzx24c4wuqn4h6hf"
    );
    expect(CVM_READY_STATE_SOURCE).toContain("scripts/cvm_live_verify.py");
  });
});

describe("orchestration (payForSms) with an injected client", () => {
  it("probes pricing, mints a token, then sends with it", async () => {
    const { payForSms } = await import("src/js/cvmPayment");
    const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];
    const fakeClient = {
      call: vi.fn(async (tool: string, args: Record<string, unknown>) => {
        calls.push({ tool, args });
        if (tool === "sms.pricing") {
          return {
            result: {
              content: [{ type: "text", text: JSON.stringify({ price: 2900 }) }],
            },
          };
        }
        return {
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  id: "snd_1",
                  accepted: true,
                  best_effort: true,
                  delivery_confirmed: false,
                  status: "queued",
                }),
              },
            ],
          },
        };
      }),
    };
    const mint = vi.fn(async () => ({ token: "cashuAminted", sats: 2900 }));

    const result = await payForSms({
      client: fakeClient as any,
      mintToken: mint,
      to: "+14155550100",
      body: "hello",
      wallet: { hasSeed: true, mintsCount: 1 },
      connectedMintUrls: [SERVICE_MINT_URL],
    });

    expect(mint).toHaveBeenCalledTimes(1);
    expect(mint.mock.calls[0][0]).toMatchObject({ sats: 2900 });
    // the paid call carried the minted token in the contract's `cashu_token`
    const send = calls.find((c) => c.tool === "sms.send");
    expect(send?.args.cashu_token).toBe("cashuAminted");
    expect(send?.args.body).toBe("hello");
    expect(result.ok).toBe(true);
    expect(result.deliveryConfirmed).toBe(false);
  });

  it("never mints or sends when the wallet has no seed", async () => {
    const { payForSms } = await import("src/js/cvmPayment");
    const fakeClient = { call: vi.fn() };
    const mint = vi.fn();
    const result = await payForSms({
      client: fakeClient as any,
      mintToken: mint,
      to: "+14155550100",
      body: "hello",
      wallet: { hasSeed: false, mintsCount: 1 },
      connectedMintUrls: [SERVICE_MINT_URL],
    });
    expect(result.ok).toBe(false);
    expect(result.errorKey).toBe("services.payErrors.noWallet");
    expect(mint).not.toHaveBeenCalled();
    expect(fakeClient.call).not.toHaveBeenCalled();
  });

  it("refuses before minting when the user's mint is not the service's", async () => {
    const { payForSms } = await import("src/js/cvmPayment");
    const fakeClient = {
      call: vi.fn(async () => ({
        result: {
          content: [{ type: "text", text: JSON.stringify({ price: 2900 }) }],
        },
      })),
    };
    const mint = vi.fn();
    const result = await payForSms({
      client: fakeClient as any,
      mintToken: mint,
      to: "+14155550100",
      body: "hello",
      wallet: { hasSeed: true, mintsCount: 1 },
      connectedMintUrls: ["https://mint.minibits.cash/Bitcoin"],
    });
    expect(result.ok).toBe(false);
    expect(result.errorKey).toBe("services.payErrors.wrongMint");
    // No money may move for a token the service would refuse.
    expect(mint).not.toHaveBeenCalled();
  });

  it("surfaces an unreachable CVM rather than faking a send", async () => {
    const { payForSms } = await import("src/js/cvmPayment");
    const fakeClient = {
      call: vi.fn(async () => {
        throw new Error("No reply from the CVM within 45000 ms (tool sms.pricing).");
      }),
    };
    const mint = vi.fn();
    const result = await payForSms({
      client: fakeClient as any,
      mintToken: mint,
      to: "+14155550100",
      body: "hello",
      wallet: { hasSeed: true, mintsCount: 1 },
      connectedMintUrls: [SERVICE_MINT_URL],
    });
    expect(result.ok).toBe(false);
    expect(result.errorKey).toBe("services.payErrors.unreachable");
    expect(mint).not.toHaveBeenCalled();
  });

  it("surfaces an insufficient-balance refusal from the mint step", async () => {
    const { payForSms } = await import("src/js/cvmPayment");
    const fakeClient = {
      call: vi.fn(async () => ({
        result: {
          content: [{ type: "text", text: JSON.stringify({ price: 2900 }) }],
        },
      })),
    };
    const mint = vi.fn(async () => {
      throw new Error("balance too low");
    });
    const result = await payForSms({
      client: fakeClient as any,
      mintToken: mint,
      to: "+14155550100",
      body: "hello",
      wallet: { hasSeed: true, mintsCount: 1 },
      connectedMintUrls: [SERVICE_MINT_URL],
    });
    expect(result.ok).toBe(false);
    expect(result.errorKey).toBe("services.payErrors.insufficientFunds");
  });
});
