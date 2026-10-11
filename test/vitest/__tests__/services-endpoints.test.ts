import { describe, it, expect } from "vitest";
import servicesEndpoints, {
  DEFAULT_CATALOG_URL,
  DEFAULT_NAMESPACE,
  DEFAULT_RELAYS,
  parseRelays,
} from "src/js/services-endpoints";

describe("services-endpoints (build-time injectable host config)", () => {
  it("falls back to the shipped defaults when no build env is injected", () => {
    expect(servicesEndpoints.catalogUrl).toBe(DEFAULT_CATALOG_URL);
    expect(servicesEndpoints.relays).toEqual(DEFAULT_RELAYS);
    expect(servicesEndpoints.namespace).toBe(DEFAULT_NAMESPACE);
    // deployTarget is diagnostics only; "local" is the un-injected default.
    expect(typeof servicesEndpoints.deployTarget).toBe("string");
  });

  it("exposes an https catalogue and at least one wss relay", () => {
    expect(servicesEndpoints.catalogUrl.startsWith("https://")).toBe(true);
    expect(servicesEndpoints.relays.length).toBeGreaterThan(0);
    for (const relay of servicesEndpoints.relays) {
      expect(relay.startsWith("wss://")).toBe(true);
    }
  });

  it("is frozen so a host cannot mutate the injected config at runtime", () => {
    expect(Object.isFrozen(servicesEndpoints)).toBe(true);
  });

  describe("parseRelays", () => {
    it("trims, drops blanks and de-duplicates", () => {
      expect(
        parseRelays(" wss://a.example , wss://b.example ,wss://a.example ")
      ).toEqual(["wss://a.example", "wss://b.example"]);
    });

    it("never yields an empty relay list", () => {
      expect(parseRelays("")).toEqual(DEFAULT_RELAYS);
      expect(parseRelays(" , , ")).toEqual(DEFAULT_RELAYS);
      expect(parseRelays(undefined)).toEqual(DEFAULT_RELAYS);
      expect(parseRelays(null)).toEqual(DEFAULT_RELAYS);
    });

    it("returns a fresh array (no shared mutable default)", () => {
      const first = parseRelays("");
      first.push("wss://mutated.example");
      expect(parseRelays("")).toEqual(DEFAULT_RELAYS);
      expect(DEFAULT_RELAYS).not.toContain("wss://mutated.example");
    });
  });
});
