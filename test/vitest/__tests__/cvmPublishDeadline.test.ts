/**
 * Regression: a CVM call whose relay publish never settles must REJECT within
 * the client timeout — never hang forever.
 *
 * Observed live (2026-10-14): with no reachable relay connection,
 * pool.publish() stays pending, `Promise.any` never settles, and the pay
 * dialog sits on "Paying..." indefinitely. The reply loop has a deadline;
 * the publish must honour the same one.
 */
import { describe, expect, it } from "vitest";
import { webcrypto } from "node:crypto";
if (!(globalThis as any).crypto) {
  (globalThis as any).crypto = webcrypto as unknown as Crypto;
}

import { generateSecretKey, getPublicKey } from "nostr-tools";
import { CvmClient } from "src/js/cvm";

const hex = (b: Uint8Array) =>
  Array.from(b)
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");

describe("CvmClient.call publish deadline", () => {
  it("rejects when the relay publish never settles (no hang)", async () => {
    const sk = hex(generateSecretKey());
    const serverPk = getPublicKey(hex(generateSecretKey()) as unknown as Uint8Array);

    // A pool whose publish NEVER settles — the exact live failure shape.
    const client = new CvmClient({
      relays: ["wss://relay.invalid"],
      serverPubkey: serverPk,
      secretKey: sk,
      timeoutMs: 300,
      // @ts-expect-error test seam: inject a dead pool
      pool: {
        publish: (() => { const p: any = new Promise(() => {}); (p as any)[Symbol.iterator] = function* () {}; return p; })(),
        subscribeMany: () => ({ close: () => {} }),
        close: (..._a: unknown[]) => {},
      },
    });

    const started = Date.now();
    await expect(client.call("sms.pricing", {})).rejects.toThrow(
      /publish|CVM/i
    );
    // It must reject via the deadline, not instantly and not after forever.
    const elapsed = Date.now() - started;
    expect(elapsed).toBeLessThan(5000);
    expect(elapsed).toBeGreaterThan(100);
  });
});
