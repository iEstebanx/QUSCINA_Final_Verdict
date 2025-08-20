// src/theme/index.js
import { createTheme, responsiveFontSizes, alpha } from "@mui/material/styles";
import { getDesignTokens } from "./tokens";

export function makeTheme({ mode, density = "comfortable" }) {
  const tokens = getDesignTokens(mode);

  let theme = createTheme({
    ...tokens,
    shape: { borderRadius: 12 },
    spacing: 8,
    breakpoints: {
      values: { xs: 0, sm: 576, md: 768, lg: 992, xl: 1200 },
    },
    typography: {
      fontFamily:
        'Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans"',
      h1: { fontWeight: 700 },
      h2: { fontWeight: 700 },
      button: { textTransform: "none", fontWeight: 600 },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: { backgroundImage: "none" },
        },
      },

      // ⚠️ FIX: remove filter-based hover (caused the huge repaint artifact)
      MuiButton: {
        defaultProps: {
          size: density === "compact" ? "small" : "medium",
        },
        styleOverrides: {
          root: ({ theme }) => ({
            borderRadius: 10,
            boxShadow: "none",
            transition: theme.transitions.create(
              ["background-color", "box-shadow", "transform"],
              { duration: theme.transitions.duration.shortest }
            ),
            "&:hover": {
              backgroundColor: alpha(
                theme.palette.primary.main,
                theme.palette.mode === "dark" ? 0.22 : 0.08
              ),
              boxShadow: "none",
            },
            "&:active": {
              transform: "translateY(0.5px)",
            },
          }),
        },
      },

      // Match hover behavior for icon buttons without using CSS filters
      MuiIconButton: {
        defaultProps: {
          size: density === "compact" ? "small" : "medium",
        },
        styleOverrides: {
          root: ({ theme }) => ({
            transition: theme.transitions.create(["background-color"], {
              duration: theme.transitions.duration.shortest,
            }),
            "&:hover": {
              backgroundColor: alpha(
                theme.palette.action.active,
                theme.palette.mode === "dark" ? 0.15 : 0.08
              ),
            },
          }),
        },
      },

      MuiTextField: {
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
                  ? "rgba(255,255,255,0.12)"
                  : "rgba(0,0,0,0.05)",
            },
          }),
        },
      },

      MuiAppBar: {
        styleOverrides: {
          colorPrimary: ({ theme }) => ({
            backgroundColor:
              theme.palette.mode === "dark"
                ? "#131313"
                : theme.palette.background.paper,
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