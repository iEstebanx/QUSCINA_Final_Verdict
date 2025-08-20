// src/theme/index.js
import { createTheme, responsiveFontSizes, alpha } from "@mui/material/styles";
import { getDesignTokens } from "./tokens";

export function makeTheme({ mode, density = "comfortable" }) {
  const tokens = getDesignTokens(mode);

  let theme = createTheme({
    ...tokens,
    shape: { borderRadius: 12 },
    spacing: 8,
    breakpoints: { values: { xs: 0, sm: 576, md: 768, lg: 992, xl: 1200 } },
    typography: {
      fontFamily:
        'Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans"',
      h1: { fontWeight: 700 },
      h2: { fontWeight: 700 },
      button: { textTransform: "none", fontWeight: 600 },
    },
    components: {
      MuiCssBaseline: { styleOverrides: { body: { backgroundImage: "none" } } },

      MuiButton: {
        defaultProps: { size: density === "compact" ? "small" : "medium" },
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
                theme.palette.mode === "dark" ? 0.16 : 0.06 // a touch softer
              ),
              boxShadow: "none",
            },
            "&:active": { transform: "translateY(0.5px)" },
          }),
        },
      },

      MuiIconButton: {
        defaultProps: { size: density === "compact" ? "small" : "medium" },
        styleOverrides: {
          root: ({ theme }) => ({
            transition: theme.transitions.create(["background-color"], {
              duration: theme.transitions.duration.shortest,
            }),
            "&:hover": {
              backgroundColor: alpha(
                theme.palette.text.primary,
                theme.palette.mode === "dark" ? 0.10 : 0.05
              ),
            },
          }),
        },
      },

      MuiListItemButton: {
        styleOverrides: {
          root: ({ theme }) => ({
            borderRadius: 12,
            "&.Mui-selected": {
              backgroundColor: alpha(
                theme.palette.primary.main,
                theme.palette.mode === "dark" ? 0.20 : 0.08
              ),
              "&:hover": {
                backgroundColor: alpha(
                  theme.palette.primary.main,
                  theme.palette.mode === "dark" ? 0.26 : 0.12
                ),
              },
            },
          }),
        },
      },

      MuiAppBar: {
        styleOverrides: {
          colorPrimary: ({ theme }) => ({
            backgroundColor: theme.palette.background.paper,
            color: theme.palette.text.primary,
            borderBottom:
              theme.palette.mode === "dark"
                ? "1px solid rgba(234,238,242,0.08)"
                : "1px solid rgba(26,31,42,0.12)",
          }),
        },
      },

      MuiPaper: {
        styleOverrides: {
          root: ({ theme }) => ({
            backgroundImage: "none",
            ...(theme.palette.mode === "dark"
              ? { border: "1px solid rgba(234,238,242,0.08)" }
              : { border: "1px solid rgba(26,31,42,0.10)" }),
          }),
        },
      },
    },
  });

  theme = responsiveFontSizes(theme);
  return theme;
}
