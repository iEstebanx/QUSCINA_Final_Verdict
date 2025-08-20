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

// One green family for both modes (consistent hue)
const ACCENT_LIGHT = "#2e7d32"; // green[800]
const ACCENT_DARK  = "#66bb6a"; // green[300]

export function getDesignTokens(mode) {
  switch (mode) {
    case "dark":
      return {
        palette: {
          mode: "dark",
          primary: { main: ACCENT_DARK },
          secondary: { main: "#9e9e9e" },
          background: { default: "#0f1115", paper: "#16181d" },
          text: { primary: "#eaeef2", secondary: "#a8b0b9" },
          divider: "rgba(234,238,242,0.08)",
          grey: warmNeutrals,
        },
      };

    case "light":
      return {
        palette: {
          mode: "light",
          primary: { main: ACCENT_LIGHT },
          secondary: { main: "#757575" },

          // ⬇️ Dimmer, low-glare surfaces
          // default: overall app canvas
          // paper: cards/panels – slightly off-white to reduce glare
          background: { default: "#f0f2f5", paper: "#f7f8fa" },

          // slightly deeper text for readability on dimmer bg
          text: { primary: "#1a1f2a", secondary: "#4b5563" },

          // a hair stronger divider so components separate on softer bg
          divider: "rgba(26,31,42,0.12)",
          grey: warmNeutrals,
        },
      };

    case "sepia":
      return {
        palette: {
          mode: "light",
          primary: { main: "#8b5e34" },
          secondary: { main: "#b08968" },
          background: { default: "#f7f0e6", paper: "#f3e7d8" },
          text: { primary: "#3e362e" },
          divider: "rgba(0,0,0,0.08)",
          grey: warmNeutrals,
        },
      };

    case "blue":
      return {
        palette: {
          mode: "light",
          primary: { main: "#1565c0" },
          secondary: { main: "#42a5f5" },
          background: { default: "#e3f2fd", paper: "#ffffff" },
          text: { primary: "#0d47a1", secondary: "#1e88e5" },
        },
      };

    case "lightBlue":
      return {
        palette: {
          mode: "light",
          primary: { main: "#0288d1" },
          secondary: { main: "#81d4fa" },
          background: { default: "#e1f5fe", paper: "#ffffff" },
          text: { primary: "#01579b", secondary: "#0277bd" },
        },
      };

    case "green":
      return {
        palette: {
          mode: "light",
          primary: { main: ACCENT_LIGHT },
          secondary: { main: "#66bb6a" },
          background: { default: "#e8f5e9", paper: "#ffffff" },
          text: { primary: "#1b5e20", secondary: "#2e7d32" },
        },
      };

    case "red":
      return {
        palette: {
          mode: "light",
          primary: { main: "#c62828" },
          secondary: { main: "#ef5350" },
          background: { default: "#ffebee", paper: "#ffffff" },
          text: { primary: "#b71c1c", secondary: "#d32f2f" },
        },
      };

    default:
      return getDesignTokens("light");
  }
}
