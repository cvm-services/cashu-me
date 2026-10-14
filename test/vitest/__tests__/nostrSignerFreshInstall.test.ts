/**
 * Regression: the app must not crash on a fresh install while initialising the
 * Nostr signer.
 *
 * Symptom (observed in a real browser and in CI e2e):
 *   TypeError: e?.user is not a function
 *       at set signer  (...ui.js)
 *       at new NDK     (...ui.js)
 *
 * Cause: initWalletSeedPrivateKeySigner() awaits walletSeedGenerateKeyPair()
 * and then hands this.seedSigner to setSigner() unconditionally. On a fresh
 * install there is no seed, so walletSeedGenerateKeyPair() returns early and
 * seedSigner is still its default `{}`. `new NDK({ signer: {} })` calls
 * signer.user(), which does not exist on a plain object -> the store throws,
 * the app never mounts, and every e2e assertion fails with "wallet-send not
 * found" / a blank screen.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("src/stores/mints", () => ({
  useMintsStore: () => ({ activeMintUrl: "", activeUnit: "sat", mints: [] }),
}));
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

let nostrStore: any;
let walletStore: any;

beforeAll(async () => {
  (globalThis as any).windowMixin = {
    computed: {},
    methods: {},
    data: () => ({}),
  };
  const pinia = await import("pinia");
  pinia.setActivePinia(pinia.createPinia());
  const walletModule = await import("src/stores/wallet");
  walletStore = walletModule.useWalletStore();
  const nostrModule = await import("src/stores/nostr");
  nostrStore = nostrModule.useNostrStore();
});

describe("nostr signer initialisation on a fresh install", () => {
  it("does not throw when there is no seed yet", async () => {
    walletStore.mnemonic = "";
    expect(walletStore.hasSeed).toBe(false);
    await expect(
      nostrStore.initWalletSeedPrivateKeySigner()
    ).resolves.not.toThrow();
  });

  it("does not build an NDK with a placeholder signer when there is no seed", async () => {
    walletStore.mnemonic = "";
    await nostrStore.initWalletSeedPrivateKeySigner();
    // setSigner() is what constructs `new NDK({ signer })`. Bailing out early
    // must leave `ndk` untouched (its default is `{}`) rather than half-built.
    // Note: signerType legitimately defaults to SignerType.SEED, so it is not
    // an indicator of readiness here.
    expect(nostrStore.ndk).toEqual({});
  });
});
