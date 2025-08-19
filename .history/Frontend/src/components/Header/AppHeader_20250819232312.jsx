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
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";

// declare once and export it
export const APPBAR_HEIGHT = 64;

export default function AppHeader({
  collapsed,
  width = 240,
  collapsedWidth = 72,
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

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

  const leftOffset = { xs: 0, sm: collapsed ? `${collapsedWidth}px` : `${width}px` };

  const onSubmit = (e) => {
    e.preventDefault();
    navigate(`/reports?search=${encodeURIComponent(query)}`);
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
        <Breadcrumbs aria-label="breadcrumb" sx={{ flexShrink: 0 }}>
          <Link component={RouterLink} underline="hover" color="inherit" to="/dashboard">
            Home
          </Link>
          {crumbs}
        </Breadcrumbs>

        <Box sx={{ flexGrow: 1 }} />

        <Box component="form" onSubmit={onSubmit} sx={{ width: { xs: "100%", sm: 360 } }}>
          <TextField
            size="small"
            fullWidth
            placeholder="Search…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton edge="end" type="submit">
                    <SearchIcon />
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
        </Box>
      </Toolbar>
    </AppBar>
  );
}