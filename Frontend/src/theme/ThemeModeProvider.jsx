// Frontend/src/theme/ThemeModeProvider.jsx
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { ThemeProvider, useMediaQuery, GlobalStyles } from "@mui/material";
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
          styles={{
            html: {
              width: "100%",
              maxWidth: "100vw",
              overflowX: "clip",               // better than hidden (prevents layout overflow)
              WebkitTextSizeAdjust: "100%",
            },
            body: {
              width: "100%",
              maxWidth: "100vw",
              overflowX: "clip",
              overscrollBehaviorX: "none",     // stop iOS rubber-banding from pushing content sideways
              touchAction: "pan-y",            // only vertical panning at page level
            },
            "#root": {
              width: "100%",
              maxWidth: "100vw",
              minHeight: "100dvh",
              overflowX: "clip",
              position: "relative",
            },

            /* ✅ sensible defaults so wide content scrolls INSIDE its container, not the page */
            ".scroll-x": { overflowX: "auto", overflowY: "hidden", WebkitOverflowScrolling: "touch" },

            /* Tables: encourage inner scrolling + predictable sizing app-wide */
            "table": { tableLayout: "fixed" },
            ".table-max-content": { width: "max-content" },

            /* Prevent accidental min-content overflow from flex/grid children */
            "*, *::before, *::after": { boxSizing: "border-box" },
          }}
        />

        {children}
      </ThemeProvider>
    </ThemeCtx.Provider>
  );
}