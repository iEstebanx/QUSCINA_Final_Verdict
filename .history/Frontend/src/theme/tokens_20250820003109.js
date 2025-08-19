// src/theme/tokens.js
export const MODES = ["light", "dark", "dim", "oled", "sepia"];

export function getDesignTokens(mode) {
  switch (mode) {
    case "dark":
      return {
        palette: {
          mode: "dark",
          primary: { main: "#7dd3fc" },
          secondary: { main: "#a78bfa" },
          background: { default: "#0b1020", paper: "#111827" },
        },
      };
    case "dim": // softer dark
      return {
        palette: {
          mode: "dark",
          primary: { main: "#93c5fd" },
          secondary: { main: "#c4b5fd" },
          background: { default: "#151923", paper: "#1b2030" },
        },
      };
    case "oled": // true black
      return {
        palette: {
          mode: "dark",
          primary: { main: "#60a5fa" },
          secondary: { main: "#f59e0b" },
          background: { default: "#000000", paper: "#0a0a0a" },
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
        },
      };
    default: // light
      return {
        palette: {
          mode: "light",
          primary: { main: "#1976d2" },
          secondary: { main: "#9c27b0" },
          background: { default: "#f7f9fc", paper: "#ffffff" },
        },
      };
  }
}