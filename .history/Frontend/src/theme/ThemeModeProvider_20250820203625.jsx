// src/theme/ThemeModeProvider.jsx
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { ThemeProvider, useMediaQuery } from "@mui/material";
import CssBaseline from "@mui/material/CssBaseline";
import { makeTheme } from "./index";
import { MODES } from "./tokens";

const ThemeCtx = createContext(null);
export const useThemeMode = () => useContext(ThemeCtx);

const LS_KEY = "ui-color-mode";
const LS_DENSITY = "ui-density"; // "comfortable" | "compact"

export default function ThemeModeProvider({ children }) {
  // keep user’s default as sepia
  const [mode, setMode] = useState(() => {
    const saved = localStorage.getItem(LS_KEY);
    return saved || "sepia";
  });

  const [density, setDensity] = useState(() => {
    return localStorage.getItem(LS_DENSITY) || "comfortable";
  });

  // Auto-compact on small screens (but let manual override win)
  const isSmall = useMediaQuery("(max-width: 640px)");
  const effectiveDensity = useMemo(() => {
    const manual = localStorage.getItem(LS_DENSITY);
    return manual ? density : isSmall ? "compact" : density;
  }, [density, isSmall]);

  useEffect(() => localStorage.setItem(LS_KEY, mode), [mode]);
  useEffect(() => localStorage.setItem(LS_DENSITY, density), [density]);

  const theme = useMemo(
    () => makeTheme({ mode, density: effectiveDensity }),
    [mode, effectiveDensity]
  );

  const cycleMode = () => {
    const idx = MODES.indexOf(mode);
    setMode(MODES[(idx + 1) % MODES.length]);
  };

  const value = useMemo(
    () => ({ mode, setMode, cycleMode, density, setDensity }),
    [mode, density]
  );

  return (
    <ThemeCtx.Provider value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ThemeCtx.Provider>
  );
}

// src/theme/ThemeModeProvider.jsx
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { ThemeProvider, useMediaQuery } from "@mui/material";
import CssBaseline from "@mui/material/CssBaseline";
import { makeTheme } from "./index";
import { MODES } from "./tokens";

const ThemeCtx = createContext(null);
export const useThemeMode = () => useContext(ThemeCtx);

const LS_KEY = "ui-color-mode";
const LS_DENSITY = "ui-density"; // "comfortable" | "compact"

export default function ThemeModeProvider({ children }) {
  // keep user’s default as sepia
  const [mode, setMode] = useState(() => {
    const saved = localStorage.getItem(LS_KEY);
    return saved || "sepia";
  });

  const [density, setDensity] = useState(() => {
    return localStorage.getItem(LS_DENSITY) || "comfortable";
  });

  // Auto-compact on small screens (but let manual override win)
  const isSmall = useMediaQuery("(max-width: 640px)");
  const effectiveDensity = useMemo(() => {
    const manual = localStorage.getItem(LS_DENSITY);
    return manual ? density : isSmall ? "compact" : density;
  }, [density, isSmall]);

  useEffect(() => localStorage.setItem(LS_KEY, mode), [mode]);
  useEffect(() => localStorage.setItem(LS_DENSITY, density), [density]);

  const theme = useMemo(
    () => makeTheme({ mode, density: effectiveDensity }),
    [mode, effectiveDensity]
  );

  const cycleMode = () => {
    const idx = MODES.indexOf(mode);
    setMode(MODES[(idx + 1) % MODES.length]);
  };

  const value = useMemo(
    () => ({ mode, setMode, cycleMode, density, setDensity }),
    [mode, density]
  );

  return (
    <ThemeCtx.Provider value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ThemeCtx.Provider>
  );
}