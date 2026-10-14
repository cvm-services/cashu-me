import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// The ServicesPage mount returns empty HTML in this repo's vitest harness, so
// the wiring is verified the same way the design was (servicesRedesign.test):
// as a source contract, plus the pure logic it delegates to (cvmPayment.test).
// This asserts the pay button no longer fakes a success.

const read = (path: string) => readFileSync(path, "utf8");
const page = () => read("src/pages/ServicesPage.vue");
const wallet = () => read("src/stores/wallet.ts");

describe("ServicesPage pay step is wired to the CVM", () => {
  it("the confirm-pay button calls payNow instead of faking step = 'sent'", () => {
    const src = page();
    expect(src).toMatch(/data-testid="confirm-pay-btn"/);
    expect(src).toMatch(/@click="payNow"/);
    // the old placeholder — pressing pay must never jump straight to 'sent'
    expect(src).not.toMatch(
      /data-testid="confirm-pay-btn"[^>]*@click="step = 'sent'"/
    );
  });

  it("imports the payment path and the transport", () => {
    const src = page();
    expect(src).toMatch(/from "src\/js\/cvmPayment"/);
    expect(src).toMatch(/CvmClient/);
    expect(src).toMatch(/payForSms/);
  });

  it("surfaces the honest result fields and the no-receipts caveat", () => {
    const src = page();
    expect(src).toMatch(/data-testid="send-result"/);
    expect(src).toMatch(/data-testid="no-receipts"/);
    expect(src).toMatch(/resultAccepted/);
    // the caveat must be unconditional HTML, not behind a v-if on the result
    expect(src).toMatch(/<div class="svc-warn" data-testid="no-receipts">/);
  });

  it("shows a refusal's machine reason rather than hiding it", () => {
    const src = page();
    expect(src).toMatch(/data-testid="pay-error"/);
    expect(src).toMatch(/data-testid="pay-error-reason"/);
    expect(src).toMatch(/payErrorReason/);
  });

  it("keeps the requested testids and the Options API + windowMixin style", () => {
    const src = page();
    expect(src).toMatch(/data-testid="pay-step"/);
    expect(src).toMatch(/mixins: \[windowMixin\]/);
    expect(src).toMatch(/defineComponent/);
  });

  it("disables the pay button while a payment is in flight", () => {
    const src = page();
    expect(src).toMatch(/:disabled="paying"/);
  });

  it("uses the src/ import alias (no relative climbs)", () => {
    expect(page()).not.toMatch(/from "\.\.\/\.\.\//);
  });

  it("signs with the seed-derived signer the boot step actually creates", () => {
    // The CVM gift wrap is signed by the wallet-seed keypair; that lives on the
    // nostr store (`nostr.initWalletSeedPrivateKeySigner`), not on the wallet
    // store. A wrong store here would only fail at runtime, on a real payment.
    const src = page();
    expect(src).toMatch(/useNostrStore\(\)/);
    expect(src).toMatch(/seedSignerPrivateKey/);
    expect(src).not.toMatch(/wallet\.seedSignerPrivateKey/);
  });

  it("records the spend through addPaymentHistory, not a raw array push", () => {
    expect(page()).toMatch(/addPaymentHistory/);
    expect(page()).not.toMatch(/invoiceHistory\.push/);
  });
});

describe("wallet.mintPaymentToken is the mint/token step", () => {
  it("exists, serializes proofs, and mints with fee headroom", () => {
    const src = wallet();
    expect(src).toMatch(/mintPaymentToken: async function/);
    expect(src).toMatch(/serializeProofs\(sendProofs\)/);
    // includeFees=true is the trailing-fee headroom the service needs
    expect(src).toMatch(/includeFees/);
  });

  it("invalidates the sent proofs so a failed remote send cannot re-spend them", () => {
    // `send(proofs, wallet, amount, true, true, …)` — the 4th arg is invalidate
    const src = wallet();
    const call = src.match(
      /await this\.send\(\s*proofs,\s*wallet,\s*amount,([\s\S]*?)\);/
    );
    expect(call).not.toBeNull();
    expect(call![1].replace(/\s|\/\/[^\n]*/g, "")).toMatch(/^true,true,/);
  });
});
