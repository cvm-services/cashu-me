import { beforeAll, describe, expect, it, vi } from "vitest";

// Regression: on a FRESH install the wallet has no mnemonic yet. Any code path
// that reaches the `seed` getter throws `Invalid mnemonic` and, because callers
// like subscribeToNip17DirectMessages run from WalletPage.created(), the whole
// page dies before onboarding can complete. The seed getter must be safe to
// touch before onboarding, and the seed-derived keypair must refuse to sign
// with an empty mnemonic instead of crashing.

vi.mock("src/stores/mints", () => ({
  useMintsStore: () => ({ activeMintUrl: "", activeUnit: "sat", mints: [] }),
}));
// wallet.ts calls useI18n() at store-state scope, which needs an active app
// context; stub the module so the store can be constructed in a plain vitest env.
vi.mock("vue-i18n", async (importOriginal) => ({
  ...(await importOriginal<typeof import("vue-i18n")>()),
  useI18n: () => ({ t: (key: string) => key }),
}));
vi.mock("src/stores/nostrMintBackup", () => ({
  useNostrMintBackupStore: () => ({}),
}));
vi.mock("src/js/notify", () => ({
  notifySuccess: () => undefined,
  notifyError: () => undefined,
  notifyApiError: () => undefined,
  notifyWarning: () => undefined,
}));

let walletStore: any;

beforeAll(async () => {
  (globalThis as any).windowMixin = {
    computed: {},
    methods: {},
    data: () => ({}),
  };
  const pinia = await import("pinia");
  pinia.setActivePinia(pinia.createPinia());
  const { useWalletStore } = await import("src/stores/wallet");
  walletStore = useWalletStore();
});

describe("wallet seed getter on a fresh install", () => {
  it("does not throw when no mnemonic has been generated yet", () => {
    walletStore.mnemonic = "";
    expect(() => walletStore.seed).not.toThrow();
  });

  it("reports the wallet is not ready when the mnemonic is empty", () => {
    walletStore.mnemonic = "";
    expect(walletStore.hasSeed).toBe(false);
  });

  it("reports readiness once a mnemonic exists", () => {
    walletStore.mnemonic =
      "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
    expect(walletStore.hasSeed).toBe(true);
    expect(walletStore.seed.length).toBe(64);
  });
});

describe("welcome redirect with the hash router", () => {
  // Regression: WalletPage.showWelcomePage() appended window.location.hash to a
  // router push. Under the hash router the hash IS the path, so the URL became
  // "/#/welcome#/" and the user never reached onboarding.
  it("does not append the current hash to a router push", async () => {
    const fs = await import("node:fs");
    const source = fs.readFileSync("src/pages/WalletPage.vue", "utf8");
    expect(source).not.toMatch(
      /this\.\$router\.push\(\s*["'`]\/welcome["'`]\s*\+\s*currentQuery\s*\+\s*currentHash/
    );
    expect(source).not.toMatch(/const currentHash = window\.location\.hash/);
  });
});
