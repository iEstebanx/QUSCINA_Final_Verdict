// Frontend/src/theme/themeModeProvider.jsx
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { ThemeProvider, useMediaQuery, GlobalStyles } from "@mui/material";
import { alpha } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { makeTheme } from "./index";

const ThemeCtx = createContext(null);
export const useThemeMode = () => useContext(ThemeCtx);

const LS_DENSITY = "ui-density";

export default function ThemeModeProvider({ children }) {
  // App-level mode label (for your own logic/UI); MUI palette.mode remains "light".
  const mode = "sepia";

  const [density, setDensity] = useState(
    () => localStorage.getItem(LS_DENSITY) || "comfortable"
  );

  const isSmall = useMediaQuery("(max-width: 640px)");
  const effectiveDensity = useMemo(() => {
    const manual = localStorage.getItem(LS_DENSITY);
    return manual ? density : isSmall ? "compact" : density;
  }, [density, isSmall]);

  useEffect(() => {
    localStorage.setItem(LS_DENSITY, density);
  }, [density]);

  const theme = useMemo(
    () => makeTheme({ mode, density: effectiveDensity }),
    [mode, effectiveDensity]
  );

  // Keep API surface for compatibility, but make mode setters no-ops.
  const value = useMemo(
    () => ({
      mode,              // "sepia" (app-level)
      setMode: () => {}, // no-op
      cycleMode: () => {}, // no-op
      density,
      setDensity,
    }),
    [mode, density]
  );

  return (
    <ThemeCtx.Provider value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline />

        {/* 🔒 Global “no horizontal page scroll” guard (incl. iOS) */}
        <GlobalStyles
          styles={(theme) => ({
            ".scroll-x": {
              overflowX: "auto",
              overflowY: "hidden",
              WebkitOverflowScrolling: "touch",
              overscrollBehaviorX: "contain",
              scrollbarGutter: "stable both-edges",

              /* Firefox */
              scrollbarWidth: "thin",
              scrollbarColor: `${alpha(
                theme.palette.primary.main,
                theme.palette.mode === "dark" ? 0.7 : 0.5
              )} ${alpha(
                theme.palette.text.primary,
                theme.palette.mode === "dark" ? 0.2 : 0.1
              )}`,
            },

            /* Chrome / Edge / Safari */
            ".scroll-x::-webkit-scrollbar": {
              height: 15,
              width: 15,
            },
            ".scroll-x::-webkit-scrollbar-track": {
              backgroundColor: alpha(
                theme.palette.text.primary,
                theme.palette.mode === "dark" ? 0.18 : 0.08
              ),
              borderRadius: 9999,
            },
            ".scroll-x::-webkit-scrollbar-thumb": {
              backgroundColor: alpha(
                theme.palette.primary.main,
                theme.palette.mode === "dark" ? 0.65 : 0.5
              ),
              borderRadius: 9999,
              border: `3px solid ${theme.palette.background.paper}`,
            },
            ".scroll-x:hover::-webkit-scrollbar-thumb": {
              backgroundColor: alpha(
                theme.palette.primary.main,
                theme.palette.mode === "dark" ? 0.8 : 0.65
              ),
            },
            ".scroll-x::-webkit-scrollbar-thumb:active": {
              backgroundColor: alpha(
                theme.palette.primary.main,
                theme.palette.mode === "dark" ? 0.95 : 0.8
              ),
            },
          })}
        />

        {children}
      </ThemeProvider>
    </ThemeCtx.Provider>
  );
}