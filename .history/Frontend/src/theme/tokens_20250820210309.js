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

export function getDesignTokens(mode) {
  switch (mode) {
    case "dark":
      return {
        palette: {
          mode: "dark",
          primary: { main: "#90caf9" },   // light indigo/blue accent
          secondary: { main: "#80cbc4" }, // teal
          background: { default: "#121212", paper: "#1e1e1e" },
          text: { primary: "#ffffff", secondary: "#b3b3b3" },
          grey: warmNeutrals,
        },
      };

    case "light":
      return {
        palette: {
          mode: "light",
          primary: { main: "#1976d2" },   // strong blue
          secondary: { main: "#009688" }, // teal
          background: { default: "#fafafa", paper: "#ffffff" },
          text: { primary: "#212121", secondary: "#555555" },
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
          primary: { main: "#2e7d32" },
          secondary: { main: "#66bb6a" },
          background: { default: "#e8f5e9", paper: "#ffffff" },
          text: { primary: "#1b5e20", secondary: "#388e3c" },
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
      return getDesignTokens("sepia");
  }
}
