// src/theme/index.js
import { createTheme, responsiveFontSizes } from "@mui/material/styles";
import { getDesignTokens } from "./tokens";

export function makeTheme({ mode, density = "comfortable" }) {
  const tokens = getDesignTokens(mode);

  let theme = createTheme({
    ...tokens,
    shape: { borderRadius: 12 },
    spacing: 8,
    // Custom breakpoints (kept as-is)
    breakpoints: {
      values: { xs: 0, sm: 576, md: 768, lg: 992, xl: 1200 },
    },
    typography: {
      fontFamily:
        'Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", "Apple Color Emoji","Segoe UI Emoji"',
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
          root: ({ theme }) => ({
            borderRadius: 10,
            // keep colors warm/neutral and reduce ultra-saturated states
            "&:hover": {
              filter: theme.palette.mode === "dark" ? "brightness(1.06)" : "brightness(0.98)",
            },
          }),
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
          root: ({ theme }) => ({
            borderRadius: 12,
            "&.Mui-selected": {
              backgroundColor:
                theme.palette.mode === "dark"
                  ? "rgba(212,163,115,0.16)" // based on warm amber
                  : "rgba(124,90,60,0.10)",  // based on warm brown
            },
          }),
        },
      },
      MuiChip: {
        styleOverrides: {
          filled: ({ theme }) => ({
            backgroundColor:
              theme.palette.mode === "dark" ? "rgba(212,163,115,0.18)" : "rgba(124,90,60,0.12)",
          }),
        },
      },
      MuiAppBar: {
        styleOverrides: {
          colorPrimary: ({ theme }) => ({
            backgroundColor:
              theme.palette.mode === "dark" ? "#131313" : theme.palette.background.paper,
            color: theme.palette.text.primary,
          }),
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: ({ theme }) => ({
            backgroundImage: "none",
            ...(theme.palette.mode === "dark"
              ? { border: "1px solid rgba(255,255,255,0.06)" }
              : { border: "1px solid rgba(0,0,0,0.04)" }),
          }),
        },
      },
    },
  });

  theme = responsiveFontSizes(theme);
  return theme;
}