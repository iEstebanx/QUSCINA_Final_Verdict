// src/theme/index.js
import { createTheme, responsiveFontSizes } from "@mui/material/styles";
import { getDesignTokens } from "./tokens";

export function makeTheme({ mode, density = "comfortable" }) {
  const tokens = getDesignTokens(mode);

  let theme = createTheme({
    ...tokens,
    shape: { borderRadius: 12 },
    spacing: 8,
    // Your custom breakpoints (tweak to taste)
    breakpoints: {
      values: { xs: 0, sm: 576, md: 768, lg: 992, xl: 1200 },
    },
    typography: {
      fontFamily: `Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", "Apple Color Emoji","Segoe UI Emoji"`,
      h1: { fontWeight: 700 },
      h2: { fontWeight: 700 },
      button: { textTransform: "none", fontWeight: 600 },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            backgroundImage: "none",
          },
        },
      },
      MuiButton: {
        defaultProps: {
          size: density === "compact" ? "small" : "medium",
        },
        styleOverrides: {
          root: { borderRadius: 10 },
        },
      },
      MuiTextField: {
        defaultProps: {
          size: density === "compact" ? "small" : "medium",
        },
      },
      MuiIconButton: {
        defaultProps: {
          size: density === "compact" ? "small" : "medium",
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: 12,
          },
        },
      },
    },
  });

  theme = responsiveFontSizes(theme);
  return theme;
}