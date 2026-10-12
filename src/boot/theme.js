import { applyStoredTheme } from "src/js/theme";

// Apply the persisted (or OS-preferred) theme before the app mounts, so the
// first paint is already in the right design — no flash of the wrong theme.
export default () => {
  applyStoredTheme();
};
