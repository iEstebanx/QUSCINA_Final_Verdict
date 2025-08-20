// src/theme/tokens.js
export const MODES = [
  "light",
  "dark",
  "sepia",
  "blue",
  "lightBlue",
  "orange",
  "green",
  "red",
];

// Warm neutrals for sepia / warm palettes
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
          primary: { main: "#D4A373" },
          secondary: { main: "#9A8C84" },
          background: { default: "#0F0F0F", paper: "#151515" },
          text: { primary: "#ECE9E6", secondary: "#CFCAC5" },
          grey: warmNeutrals,
        },
      };

    case "light":
      return {
        palette: {
          mode: "light",
          primary: { main: "#7C5A3C" },
          secondary: { main: "#C9ADA7" },
          background: { default: "#FAF7F2", paper: "#FFFFFF" },
          text: { primary: "#2B2B2B", secondary: "#544B45" },
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
          grey: warmNeutrals,
        },
      };

    case "blue":
      return {
        palette: {
          mode: "light",
          primary: { main: "#1976d2" },
          secondary: { main: "#42a5f5" },
          background: { default: "#e3f2fd", paper: "#ffffff" },
          text: { primary: "#0d47a1" },
        },
      };

    case "lightBlue":
      return {
        palette: {
          mode: "light",
          primary: { main: "#0288d1" },
          secondary: { main: "#4dd0e1" },
          background: { default: "#e0f7fa", paper: "#ffffff" },
          text: { primary: "#01579b" },
        },
      };

    case "orange":
      return {
        palette: {
          mode: "light",
          primary: { main: "#ef6c00" },
          secondary: { main: "#ff9800" },
          background: { default: "#fff3e0", paper: "#ffffff" },
          text: { primary: "#e65100" },
        },
      };

    case "green":
      return {
        palette: {
          mode: "light",
          primary: { main: "#2e7d32" },
          secondary: { main: "#66bb6a" },
          background: { default: "#e8f5e9", paper: "#ffffff" },
          text: { primary: "#1b5e20" },
        },
      };

    case "red":
      return {
        palette: {
          mode: "light",
          primary: { main: "#c62828" },
          secondary: { main: "#ef5350" },
          background: { default: "#ffebee", paper: "#ffffff" },
          text: { primary: "#b71c1c" },
        },
      };

    default:
      return getDesignTokens("sepia"); // fallback
  }
}