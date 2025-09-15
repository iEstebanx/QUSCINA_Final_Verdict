// Frontend/src/theme/index.js
import { createTheme, responsiveFontSizes, alpha } from "@mui/material/styles";
import { getDesignTokens } from "./tokens";

export function makeTheme({ mode, density = "comfortable" }) {
  // getDesignTokens will return a Sepia-looking palette with palette.mode = "light"
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
        styleOverrides: { body: { backgroundImage: "none" } },
      },

      // Subtle, consistent hover (no filters)
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
                theme.palette.mode === "dark" ? 0.18 : 0.08
              ),
              boxShadow: "none",
            },
            "&:active": { transform: "translateY(0.5px)" },
          }),
        },
      },

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
                theme.palette.text.primary,
                theme.palette.mode === "dark" ? 0.12 : 0.06
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
              backgroundColor: alpha(
                theme.palette.primary.main,
                theme.palette.mode === "dark" ? 0.22 : 0.10
              ),
              "&:hover": {
                backgroundColor: alpha(
                  theme.palette.primary.main,
                  theme.palette.mode === "dark" ? 0.28 : 0.14
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
                : "1px solid rgba(0,0,0,0.08)",
          }),
        },
      },

      MuiPaper: {
        styleOverrides: {
          root: ({ theme }) => ({
            backgroundImage: "none",
            ...(theme.palette.mode === "dark"
              ? { border: "1px solid rgba(234,238,242,0.08)" }
              : { border: "1px solid rgba(0,0,0,0.06)" }),
          }),
        },
      },
    },
  });

  theme = responsiveFontSizes(theme);
  return theme;
}