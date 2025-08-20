// src/theme/tokens.js
export const MODES = ["light", "dark", "dim", "oled", "sepia"];

const warmNeutrals = {
  // a subtle, warm gray ramp you can reuse if needed elsewhere
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

export function getDesignTokens(mode) {
  switch (mode) {
    case "dark":
      // Dark, warm neutrals — no blues
      return {
        palette: {
          mode: "dark",
          primary: { main: "#D4A373" },       // warm amber-tan
          secondary: { main: "#9A8C84" },     // taupe
          background: { default: "#0F0F0F", paper: "#151515" },
          text: { primary: "#ECE9E6", secondary: "#CFCAC5" },
          divider: "rgba(236,233,230,0.12)",
          grey: warmNeutrals,
        },
      };

    case "dim": // softer dark, same hue family but lower contrast
      return {
        palette: {
          mode: "dark",
          primary: { main: "#C9A27A" },       // softer amber-tan
          secondary: { main: "#8F827B" },     // soft taupe
          background: { default: "#141414", paper: "#1B1B1B" },
          text: { primary: "#E7E3DF", secondary: "#C6C1BC" },
          divider: "rgba(231,227,223,0.1)",
          grey: warmNeutrals,
        },
      };

    case "oled": // true black with warm accents, no blues
      return {
        palette: {
          mode: "dark",
          primary: { main: "#E0A96D" },       // warm amber
          secondary: { main: "#8A7D72" },     // warm stone
          background: { default: "#000000", paper: "#0A0A0A" },
          text: { primary: "#EFEAE4", secondary: "#CCC5BE" },
          divider: "rgba(239,234,228,0.12)",
          grey: warmNeutrals,
        },
      };

    case "light":
      // Light mode with warm, earthy tones — no blue primaries/secondaries
      return {
        palette: {
          mode: "light",
          primary: { main: "#7C5A3C" },       // warm brown
          secondary: { main: "#C9ADA7" },     // muted rosy beige
          background: { default: "#FAF7F2", paper: "#FFFFFF" },
          text: { primary: "#2B2B2B", secondary: "#544B45" },
          divider: "rgba(0,0,0,0.08)",
          grey: warmNeutrals,
        },
      };

    default: // sepia as default (unchanged as requested)
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
  }
}