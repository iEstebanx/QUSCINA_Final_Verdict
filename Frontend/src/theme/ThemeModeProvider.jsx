// Frontend/src/theme/ThemeModeProvider.jsx
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { ThemeProvider, useMediaQuery, GlobalStyles } from "@mui/material";
import { alpha } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { makeTheme } from "./index";
import { MODES } from "./tokens";

const ThemeCtx = createContext(null);
export const useThemeMode = () => useContext(ThemeCtx);

const LS_KEY = "ui-color-mode";
const LS_DENSITY = "ui-density";

export default function ThemeModeProvider({ children }) {
  const [mode, setMode] = useState(() => localStorage.getItem(LS_KEY) || "sepia");
  const [density, setDensity] = useState(() => localStorage.getItem(LS_DENSITY) || "comfortable");

  const isSmall = useMediaQuery("(max-width: 640px)");
  const effectiveDensity = useMemo(() => {
    const manual = localStorage.getItem(LS_DENSITY);
    return manual ? density : isSmall ? "compact" : density;
  }, [density, isSmall]);

  useEffect(() => localStorage.setItem(LS_KEY, mode), [mode]);
  useEffect(() => localStorage.setItem(LS_DENSITY, density), [density]);

  const theme = useMemo(() => makeTheme({ mode, density: effectiveDensity }), [mode, effectiveDensity]);

  const cycleMode = () => {
    const idx = MODES.indexOf(mode);
    setMode(MODES[(idx + 1) % MODES.length]);
  };

  const value = useMemo(() => ({ mode, setMode, cycleMode, density, setDensity }), [mode, density]);

  return (
    <ThemeCtx.Provider value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline />

        {/* 🔒 Global “no horizontal page scroll” guard (incl. iOS) */}
        <GlobalStyles
          styles={(theme) => ({
            /* ⬇️ Replace your current `.scroll-x` block with this */
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
              height: 15,      // horizontal bar height
              width: 15,       // (covers vertical if present)
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
              border: `3px solid ${theme.palette.background.paper}`, // inset "pill" look
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