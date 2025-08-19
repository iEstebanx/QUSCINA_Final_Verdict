// src/components/Header/AppHeader.jsx
import { useMemo, useState } from "react";
import { useLocation, Link as RouterLink, useNavigate } from "react-router-dom";
import {
  AppBar,
  Toolbar,
  Box,
  Breadcrumbs,
  Link,
  Typography,
  TextField,
  InputAdornment,
  IconButton,
  Tooltip,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import MenuIcon from "@mui/icons-material/Menu";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import WbSunnyIcon from "@mui/icons-material/WbSunny";
import ContrastIcon from "@mui/icons-material/Contrast";

import { useThemeMode } from "@/theme/ThemeModeProvider"; // ⬅️ import your context

// declare once and export it
export const APPBAR_HEIGHT = 64;

export default function AppHeader({
  collapsed,
  onToggle,
  width = 240,
  collapsedWidth = 72,
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  const { mode, cycleMode } = useThemeMode(); // ⬅️ use theme mode context

  const labelMap = {
    "": "Home",
    dashboard: "Dashboard",
    users: "Users",
    reports: "Reports",
  };

  const segments = useMemo(
    () => location.pathname.split("/").filter(Boolean),
    [location.pathname]
  );

  const crumbs = useMemo(() => {
    let pathAcc = "";
    return segments.map((seg, idx) => {
      pathAcc += `/${seg}`;
      const isLast = idx === segments.length - 1;
      const label = labelMap[seg] || seg.replace(/-/g, " ");
      return isLast ? (
        <Typography key={pathAcc} color="text.primary">
          {label}
        </Typography>
      ) : (
        <Link
          key={pathAcc}
          component={RouterLink}
          underline="hover"
          color="inherit"
          to={pathAcc}
        >
          {label}
        </Link>
      );
    });
  }, [segments]);

  const leftOffset = {
    xs: 0,
    sm: collapsed ? `${collapsedWidth}px` : `${width}px`,
  };

  const onSubmit = (e) => {
    e.preventDefault();
    navigate(`/reports?search=${encodeURIComponent(query)}`);
  };

  const renderThemeIcon = () => {
    switch (mode) {
      case "light":
        return <WbSunnyIcon />;
      case "dark":
        return <DarkModeIcon />;
      default:
        return <ContrastIcon />;
    }
  };

  return (
    <AppBar
      position="fixed"
      elevation={0}
      color="default"
      sx={{
        height: APPBAR_HEIGHT,
        borderBottom: (theme) => `1px solid ${theme.palette.divider}`,
        bgcolor: "background.paper",
        left: leftOffset,
        width: {
          xs: "100%",
          sm: `calc(100% - ${collapsed ? collapsedWidth : width}px)`,
        },
        transition: (theme) =>
          theme.transitions.create(["left", "width"], {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.shortest,
          }),
      }}
    >
      <Toolbar sx={{ minHeight: APPBAR_HEIGHT, gap: 2 }}>
        {/* Hamburger */}
        <IconButton
          edge="start"
          aria-label="Toggle sidebar"
          onClick={onToggle}
          sx={{ mr: 1 }}
        >
          <MenuIcon />
        </IconButton>

        {/* Breadcrumbs */}
        <Breadcrumbs aria-label="breadcrumb" sx={{ flexShrink: 0 }}>
          <Link
            component={RouterLink}
            underline="hover"
            color="inherit"
            to="/dashboard"
          >
            Home
          </Link>
          {crumbs}
        </Breadcrumbs>

        <Box sx={{ flexGrow: 1 }} />

        {/* Search */}
        <Box
          component="form"
          onSubmit={onSubmit}
          sx={{ width: { xs: "100%", sm: 360 } }}
        >
          <TextField
            size="small"
            fullWidth
            placeholder="Search…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            slotProps={{
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton edge="end" type="submit">
                      <SearchIcon />
                    </IconButton>
                  </InputAdornment>
                ),
              },
            }}
          />
        </Box>

        {/* Theme Toggle */}
        <Tooltip title={`Switch theme (current: ${mode})`}>
          <IconButton onClick={cycleMode} edge="end" sx={{ ml: 1 }}>
            {renderThemeIcon()}
          </IconButton>
        </Tooltip>
      </Toolbar>
    </AppBar>
  );
}
