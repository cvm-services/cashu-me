/**
 * Theme (light/dark) handling for the Cashu.me PWA.
 *
 * Two shipped designs, one toggle:
 *  - "light"  -> Calm storefront (warm off-white ground, green accent)
 *  - "dark"   -> Terminal (near-black ground, sats-orange accent)
 *
 * The toggle lives in the header. The choice persists in localStorage and,
 * on first visit, follows the OS preference.
 */
import { Dark } from "quasar";

export const THEME_KEY = "theme";

export type ThemeName = "light" | "dark";

/** Read the persisted theme, or null when the user has never chosen. */
export function storedTheme(): ThemeName | null {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === "dark" || value === "light" ? value : null;
  } catch {
    return null;
  }
}

/** Persist + apply a theme. */
export function setTheme(dark: boolean): void {
  Dark.set(dark);
  try {
    localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
  } catch {
    /* storage may be unavailable (private mode) — the in-memory theme still applies */
  }
  applyThemeClass(dark);
}

/** Toggle between light and dark, persisting the result. */
export function toggleTheme(): boolean {
  const next = !Dark.isActive;
  setTheme(next);
  return next;
}

/**
 * Apply the persisted theme on boot, falling back to the OS preference.
 * Called once from a boot file, before the app mounts.
 */
export function applyStoredTheme(): void {
  const stored = storedTheme();
  if (stored === null) {
    // Respect the operating system preference on first visit.
    const prefersDark =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    Dark.set(prefersDark);
    applyThemeClass(prefersDark);
    return;
  }
  const dark = stored === "dark";
  Dark.set(dark);
  applyThemeClass(dark);
}

/** Mirror the theme onto <html> so CSS tokens can flip without Quasar classes. */
function applyThemeClass(dark: boolean): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("app-theme-dark", dark);
  root.classList.toggle("app-theme-light", !dark);
}
