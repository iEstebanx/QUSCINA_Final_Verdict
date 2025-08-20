// src/theme/tokens.js
export const MODES = [
  "light",
  "dark",
  "sepia",
  "blue",
  "lightBlue",
  "green",
  "red",
];

const warmNeutrals = {
  50:  "#faf7f2",
  100: "#f3eee6",
  200: "#e8dfd4",
  300: "#d9cabc",
  400: "#c3b1a1",
  500: "#a89483",
  600: "#8e7b6d",
  700: "#766459",
  800: "#5e5047",
  900: "#4b403a",
};

// Default green accent (kept from your code)
const ACCENT_LIGHT = "#2e7d32"; // primary (light) — MUI green[800]
const ACCENT_DARK  = "#66bb6a"; // primary (dark)  — MUI green[300]

// --- Shared baselines (consistent neutrals) ---
const baseLight = {
  mode: "light",
  background: { default: "#F9FAFB", paper: "#FFFFFF" },
  text: { primary: "#111827", secondary: "#4B5563" },
  divider: "rgba(0,0,0,0.08)",
  grey: warmNeutrals,
  // Optional common statuses
  error:   { main: "#EF4444" },
  warning: { main: "#F59E0B" },
  success: { main: "#10B981" },
  info:    { main: "#0EA5E9" },
};

const baseDark = {
  mode: "dark",
  background: { default: "#111827", paper: "#1F2937" },
  text: { primary: "#F9FAFB", secondary: "#9CA3AF" },
  divider: "rgba(234,238,242,0.08)",
  grey: warmNeutrals,
  error:   { main: "#F87171" },
  warning: { main: "#FBBF24" },
  success: { main: "#34D399" },
  info:    { main: "#38BDF8" },
};

// Helpers to build palettes with a single primary swap
const makeLight = (primaryMain, secondaryMain = "#6B7280") => ({
  mode: baseLight.mode,
  primary: { main: primaryMain },
  secondary: { main: secondaryMain },
  background: baseLight.background,
  text: baseLight.text,
  divider: baseLight.divider,
  grey: baseLight.grey,
  error: baseLight.error,
  warning: baseLight.warning,
  success: baseLight.success,
  info: baseLight.info,
});

const makeDark = (primaryMain, secondaryMain = "#9E9E9E") => ({
  mode: baseDark.mode,
  primary: { main: primaryMain },
  secondary: { main: secondaryMain },
  background: baseDark.background,
  text: baseDark.text,
  divider: baseDark.divider,
  grey: baseDark.grey,
  error: baseDark.error,
  warning: baseDark.warning,
  success: baseDark.success,
  info: baseDark.info,
});

// Brand primaries per color theme (light variants)
const PRIMARIES = {
  blue: "#2563EB",
  lightBlue: "#0EA5E9",
  green: ACCENT_LIGHT,
  red: "#DC2626",
  sepia: "#8b5e34",
};

export function getDesignTokens(mode) {
  switch (mode) {
    // Core modes
    case "dark":
      return { palette: makeDark(ACCENT_DARK) };

    case "light":
      return { palette: makeLight(ACCENT_LIGHT) };

    // Extra themes (light neutrals, only primary changes)
    case "blue":
      return { palette: makeLight(PRIMARIES.blue) };

    case "lightBlue":
      return { palette: makeLight(PRIMARIES.lightBlue) };

    case "green":
      return { palette: makeLight(PRIMARIES.green) };

    case "red":
      return { palette: makeLight(PRIMARIES.red) };

    case "sepia":
      // Slightly warmer paper while keeping neutral baseline
      return {
        palette: {
          ...makeLight(PRIMARIES.sepia, "#b08968"),
          background: { default: "#F7F0E6", paper: "#F3E7D8" },
          text: { primary: "#3e362e", secondary: "#6b625a" },
        },
      };

    default:
      return { palette: makeLight(ACCENT_LIGHT) };
  }
}