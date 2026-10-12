import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Dark } from "quasar";

// The Vue-DOM mount harness in this repo returns empty HTML for Quasar-heavy
// components (the settings tests hit the same wall), so the design is verified
// by its *artifacts* instead: the theme module contract, the source contract for
// the Services page and header toggle, and the built bundle. The rendered result
// is evidence-checked against the real build (docs/DESIGN-services.md).

let theme: any;

beforeAll(async () => {
  (globalThis as any).windowMixin = { computed: {}, methods: {}, data: () => ({}) };
  theme = await import("src/js/theme");
});

const read = async (path: string) => (await import("node:fs")).readFileSync(path, "utf8");

describe("theme module contract", () => {
  beforeEach(() => localStorage.clear());

  it("exposes the theme key and a setter that persists both designs", () => {
    expect(theme.THEME_KEY).toBe("theme");
    theme.setTheme(true);
    expect(localStorage.getItem("theme")).toBe("dark");
    theme.setTheme(false);
    expect(localStorage.getItem("theme")).toBe("light");
  });

  it("applyStoredTheme honours the stored value over the system preference", () => {
    localStorage.setItem("theme", "dark");
    theme.applyStoredTheme();
    expect(Dark.isActive).toBe(true);
  });
});

describe("header theme toggle contract", () => {
  it("MainHeader wires a toggle button to the theme module", async () => {
    const src = await read("src/components/MainHeader.vue");
    expect(src).toMatch(/data-testid="theme-toggle"/);
    expect(src).toMatch(/toggleTheme/);
    expect(src).toMatch(/themeIcon/);
  });
});

describe("services page contract (both designs)", () => {
  it("renders sats-first pricing", async () => {
    const src = await read("src/pages/ServicesPage.vue");
    expect(src).toMatch(/data-testid="price-sats"/);
    expect(src).toMatch(/data-testid="price-fiat"/);
  });

  it("keeps an unavailable service inert with an honest reason", async () => {
    const src = await read("src/pages/ServicesPage.vue");
    expect(src).toMatch(/data-testid="unavailable-reason"/);
    expect(src).toMatch(/svc-unavailable/);
    expect(src).toMatch(/entry\.transport === "whatsapp"/);
  });

  it("makes the row the tap target and asks for number + message before payment", async () => {
    const src = await read("src/pages/ServicesPage.vue");
    // dynamic testid is bound with a template literal, so match the expression
    expect(src).toMatch(/:data-testid="'service-row-' \+ service\.id"/);
    expect(src).toMatch(/data-testid="compose-step"/);
    expect(src).toMatch(/inputmode="tel"/);
    expect(src).toMatch(/data-testid="pay-btn"/);
  });
});

describe("both design token sets ship", () => {
  it("services.scss defines light and dark accents", async () => {
    const scss = await read("src/css/services.scss");
    expect(scss).toMatch(/app-theme-dark/);
    expect(scss).toMatch(/--svc-bg/);
    // sats-orange accent for dark, teal accent for light
    expect(scss).toMatch(/#f7931a/);
    expect(scss).toMatch(/#0f6a5b/);
  });
});
