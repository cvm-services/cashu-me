/**
 * Build-time injectable endpoint config for the Cashu.me fork's CVM services
 * surface (the "Services" tab and, where present, the facilitator console).
 *
 * WHY THIS MODULE EXISTS
 * This fork is published to two hosts from one codebase, and deliberately from
 * one build artifact:
 *
 *   GitHub Pages   https://pwa.orangesync.tech        (free HTTPS, installable)
 *   VPS (vps2)     https://pwa-vps.orangesync.tech    (self-hosted, Caddy)
 *
 * Only two things may differ between those two deployments:
 *   1. the base path (PUBLIC_PATH, consumed by quasar.config.js), and
 *   2. the endpoint values below.
 * Both are injected at build time, so nothing is forked per host.
 * See .github/workflows/pwa-pages.yml (Pages leg) and the Makefile targets
 * `pwa-build` / `pwa-artifact` for the artifact that both hosts serve.
 *
 * NOTHING here is a capability gate: values are discovery hints. If a value is
 * absent the defaults below are used; the UI must still say plainly when a
 * service is unreachable rather than pretending it works.
 */

/** Endpoint configuration available to the app at runtime. */
export interface ServicesEndpoints {
  /** Static, allow-list driven CEP-6 catalogue. Read-only, fail-closed. */
  catalogUrl: string;
  /** Nostr relays for CEP-6 discovery + NIP-44 gift-wrapped CVM calls. */
  relays: string[];
  /** Advertised service namespace of the CVMs. */
  namespace: string;
  /** Which host this artifact was built for. Diagnostics only. */
  deployTarget: string;
}

export const DEFAULT_CATALOG_URL = "https://cvm.orangesync.tech/catalog.json";
export const DEFAULT_RELAYS = [
  "wss://relay1.orangesync.tech",
  "wss://relay2.orangesync.tech",
];
export const DEFAULT_NAMESPACE = "cvm-services";

/**
 * Parse a comma-separated relay list into a de-duplicated, ordered array.
 * Blank entries are dropped so `"a,,b,"` never yields an unusable empty relay.
 */
export function parseRelays(raw: string | undefined | null): string[] {
  if (!raw) return [...DEFAULT_RELAYS];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of String(raw).split(",")) {
    const url = part.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out.length > 0 ? out : [...DEFAULT_RELAYS];
}

/**
 * `process.env.*` below is replaced textually at build time by Quasar's
 * `build.env` (see quasar.config.js). There is no real `process` object in the
 * browser, hence the declaration.
 */
declare const process: { env: Record<string, string | undefined> };

export const servicesEndpoints: ServicesEndpoints = Object.freeze({
  catalogUrl: process.env.CVM_CATALOG_URL || DEFAULT_CATALOG_URL,
  relays: parseRelays(process.env.CVM_RELAYS),
  namespace: process.env.CVM_NAMESPACE || DEFAULT_NAMESPACE,
  deployTarget: process.env.SERVICES_DEPLOY_TARGET || "local",
});

export default servicesEndpoints;
