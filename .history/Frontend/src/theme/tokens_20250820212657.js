// src/theme/tokens.js
export const MODES = ["light", "dark", "sepia"];

const warmNeutrals = { /* …as-is… */ };

// One unified accent hue (teal) tuned per mode
const ACCENT = {
  light: "#0F766E", // teal-700
  dark:  "#5EEAD4", // teal-300
  sepia: "#2F6F6D", // teal-600 slightly desaturated
};

// --- Shared baselines (unchanged) ---
const baseLight = { /* …as-is… */ };
const baseDark  = { /* …as-is… */ };

// Helpers (unchanged)
const makeLight = (primaryMain, secondaryMain = "#6B7280") => ({ /* … */ });
const makeDark  = (primaryMain, secondaryMain = "#9E9E9E") => ({ /* … */ });

export function getDesignTokens(mode) {
  switch (mode) {
    case "dark":
      return { palette: makeDark(ACCENT.dark) };

    case "light":
      return { palette: makeLight(ACCENT.light) };

    case "sepia":
      return {
        palette: {
          ...makeLight(ACCENT.sepia, "#b08968"),
          background: { default: "#F7F0E6", paper: "#F3E7D8" },
          text: { primary: "#3e362e", secondary: "#6b625a" },
        },
      };

    default:
      return { palette: makeLight(ACCENT.light) };
  }
}
