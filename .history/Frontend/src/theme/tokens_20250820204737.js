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
      // Neutral dark theme:
      // Surfaces: #121212 / #1e1e1e, neutral button/link accents
      return {
        palette: {
          mode: "dark",
          primary:   { main: "#E0E0E0" }, // neutral light gray for accents
          secondary: { main: "#9E9E9E" }, // mid gray
          background: { default: "#121212", paper: "#1e1e1e" },
          text: { primary: "#FFFFFF", secondary: "#B3B3B3" },
          divider: "rgba(255,255,255,0.08)",
          grey: warmNeutrals,
        },
      };

    case "light":
      // Neutral light theme:
      // Surfaces: #FFFFFF / #FAFAFA (or vice versa), neutral dark accents
      return {
        palette: {
          mode: "light",
          primary:   { main: "#424242" }, // neutral dark gray for accents
          secondary: { main: "#9E9E9E" }, // supporting gray
          background: { default: "#FAFAFA", paper: "#FFFFFF" },
          text: { primary: "#212121", secondary: "#555555" },
          divider: "rgba(0,0,0,0.08)",
          grey: warmNeutrals,
        },
      };

    case "sepia": // keep as requested
      return {
        palette: {
          mode: "light",
          primary: { main: "#8b5e34" },
          secondary: { main: "#b08968" },
          background: { default: "#f7f0e6", paper: "#f3e7d8" },
          text: { primary: "#3e362e", secondary: "#6a5a4d" },
          divider: "rgba(0,0,0,0.08)",
          grey: warmNeutrals,
        },
      };

    // Optional color themes (light surfaces + colored accents)
    case "blue":
      return {
        palette: {
          mode: "light",
          primary: { main: "#1565c0" },
          secondary: { main: "#42a5f5" },
          background: { default: "#e3f2fd", paper: "#ffffff" },
          text: { primary: "#0d47a1", secondary: "#1e88e5" },
          divider: "rgba(0,0,0,0.08)",
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
          divider: "rgba(0,0,0,0.08)",
        },
      };

    case "orange":
      return {
        palette: {
          mode: "light",
          primary: { main: "#ef6c00" },
          secondary: { main: "#ff9800" },
          background: { default: "#fff3e0", paper: "#ffffff" },
          text: { primary: "#e65100", secondary: "#f57c00" },
          divider: "rgba(0,0,0,0.08)",
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
          divider: "rgba(0,0,0,0.08)",
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
          divider: "rgba(0,0,0,0.08)",
        },
      };

    default:
      return getDesignTokens("sepia");
  }
}