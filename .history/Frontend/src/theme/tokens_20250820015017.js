// Neutral / sepia-first palettes with zero blue usage.
// All modes share a warm, readable aesthetic with restrained accents.

export const MODES = ["light", "dark", "dim", "oled", "sepia"];

/** Small helper to keep hover/focus subtle and consistent */
function actionTokens(isDark) {
  return {
    active: isDark ? "rgba(255,255,255,0.56)" : "rgba(0,0,0,0.56)",
    hover: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
    selected: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)",
    disabled: isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.26)",
    disabledBackground: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)",
    focus: isDark ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.16)",
  };
}

export function getDesignTokens(mode) {
  switch (mode) {
    case "dark": {
      // Muted warm dark
      const primary = { main: "#C2A38A", dark: "#A88A73", light: "#D7BBA6", contrastText: "#1B1A17" };
      const secondary = { main: "#9D8C7A", dark: "#867666", light: "#B8A898", contrastText: "#1B1A17" };
      return {
        palette: {
          mode: "dark",
          primary,
          secondary,
          background: { default: "#121212", paper: "#181614" },
          text: { primary: "#F2E9E1", secondary: "rgba(242,233,225,0.72)" },
          divider: "rgba(242,233,225,0.12)",
          grey: {
            50: "#1d1c1a",
            100: "#23211f",
            200: "#2a2724",
            300: "#332f2b",
            400: "#3d3833",
            500: "#47423c",
            600: "#524c45",
            700: "#5e5750",
            800: "#6a625a",
            900: "#756d64",
          },
          action: actionTokens(true),
        },
      };
    }

    case "dim": {
      // Softer dark (a bit brighter than dark)
      const primary = { main: "#D8BFA9", dark: "#BBA18A", light: "#E6D3C3", contrastText: "#1C1B1A" };
      const secondary = { main: "#A99786", dark: "#8E816F", light: "#C3B4A4", contrastText: "#1C1B1A" };
      return {
        palette: {
          mode: "dark",
          primary,
          secondary,
          background: { default: "#151614", paper: "#1C1C1A" },
          text: { primary: "#F5EEE7", secondary: "rgba(245,238,231,0.72)" },
          divider: "rgba(245,238,231,0.12)",
          grey: {
            50: "#20201e",
            100: "#262523",
            200: "#2f2e2b",
            300: "#383733",
            400: "#423f3a",
            500: "#4b4742",
            600: "#555049",
            700: "#5f5851",
            800: "#6a625a",
            900: "#756c64",
          },
          action: actionTokens(true),
        },
      };
    }

    case "oled": {
      // True black backgrounds with warm accents
      const primary = { main: "#E1C4A8", dark: "#C3A78D", light: "#EDD7C6", contrastText: "#0A0A0A" };
      const secondary = { main: "#B79E87", dark: "#9B856F", light: "#CDB8A5", contrastText: "#0A0A0A" };
      return {
        palette: {
          mode: "dark",
          primary,
          secondary,
          background: { default: "#000000", paper: "#0A0A0A" },
          text: { primary: "#F7EFE7", secondary: "rgba(247,239,231,0.72)" },
          divider: "rgba(247,239,231,0.14)",
          grey: {
            50: "#0b0b0b",
            100: "#121212",
            200: "#1a1918",
            300: "#23211f",
            400: "#2c2a27",
            500: "#36322e",
            600: "#403b36",
            700: "#4a453f",
            800: "#555049",
            900: "#5f5951",
          },
          action: actionTokens(true),
        },
      };
    }

    case "light": {
      // Clean light with warm neutral accents (no blue)
      const primary = { main: "#7A5D48", dark: "#5F4838", light: "#9A7A62", contrastText: "#FFFFFF" };
      const secondary = { main: "#A68A6B", dark: "#8A7157", light: "#BFA487", contrastText: "#1F1B16" };
      return {
        palette: {
          mode: "light",
          primary,
          secondary,
          background: { default: "#FAF7F2", paper: "#FFFFFF" },
          text: { primary: "#2D2620", secondary: "rgba(45,38,32,0.7)" },
          divider: "rgba(45,38,32,0.12)",
          grey: {
            50: "#f7f4ef",
            100: "#eee8df",
            200: "#e4dbce",
            300: "#d8ccbb",
            400: "#ccbca7",
            500: "#bea991",
            600: "#b19b83",
            700: "#a38c74",
            800: "#8f7964",
            900: "#786350",
          },
          action: actionTokens(false),
        },
      };
    }

    default: // "sepia"
    {
      // Sepia-forward reading mode
      const primary = { main: "#8B5E34", dark: "#6F4B2A", light: "#A77A4E", contrastText: "#FFFFFF" };
      const secondary = { main: "#B08968", dark: "#8E6E53", light: "#C6A88A", contrastText: "#1F1B16" };
      return {
        palette: {
          mode: "light",
          primary,
          secondary,
          background: { default: "#F7F0E6", paper: "#F3E7D8" },
          text: { primary: "#3E362E", secondary: "rgba(62,54,46,0.7)" },
          divider: "rgba(62,54,46,0.14)",
          grey: {
            50: "#fbf6ef",
            100: "#f7efe5",
            200: "#efe1cf",
            300: "#e3cfb4",
            400: "#d6bd9a",
            500: "#caa983",
            600: "#b9916a",
            700: "#a77a55",
            800: "#906642",
            900: "#7a5536",
          },
          action: actionTokens(false),
        },
      };
    }
  }
}