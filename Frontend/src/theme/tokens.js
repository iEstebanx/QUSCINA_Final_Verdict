// Frontend/src/theme/tokens.js
export const MODES = ["sepia"]; // app-level variant (not used by MUI createPalette)

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

export function getDesignTokens(/* appMode = "sepia" */) {
  return {
    palette: {
      mode: "light",
      primary:   { main: "#8b5e34" },
      secondary: { main: "#b08968" },
      background: { default: "#F7F0E6", paper: "#F3E7D8" },
      text:       { primary: "#3e362e", secondary: "#6b625a" },
      grey: warmNeutrals,
    },
  };
}