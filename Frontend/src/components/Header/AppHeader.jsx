// Frontend.src/components/Header/AppHeader.jsx
import { useMemo, useState } from "react";
import PropTypes from "prop-types";
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

// export once and reuse everywhere
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

  // Readable labels per path segment
  const labelMap = {
    "": "Home",
    dashboard: "Dashboard",
    users: "Users",
    reports: "Reports",
    menu: "Menu",
    inventory: "Inventory",
    settings: "Settings",
    items: "Item List", // special case
  };

  // NEW: For any "group" segment, where should clicking the crumb go?
  // Add more groups by mapping segment -> its default first child.
  // Keep inventory/settings commented until their routes exist.
  const groupFirstChild = {
    menu: "items",
    // inventory: "stock-adjustment",
    // settings: "payment-types",
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

      // Label (with capitalization + special cases)
      let label = labelMap[seg] || seg.replace(/-/g, " ");
      label = label.charAt(0).toUpperCase() + label.slice(1);

      if (isLast) {
        return (
          <Typography key={pathAcc} color="text.primary">
            {label}
          </Typography>
        );
      }

      // If this crumb is a "group", clicking it should go to its first child
      // e.g. "/menu" -> "/menu/items"
      let target = pathAcc;
      const firstChild = groupFirstChild[seg];
      if (firstChild) {
        target = `${pathAcc}/${firstChild}`;
      }

      return (
        <Link
          key={pathAcc}
          component={RouterLink}
          underline="hover"
          color="inherit"
          to={target}
        >
          {label}
        </Link>
      );
    });
  }, [segments]);

  // Left offset only matters on sm+ (when sidebar is fixed).
  const leftOffset = {
    xs: 0,
    sm: collapsed ? `${collapsedWidth}px` : `${width}px`,
  };

  const onSubmit = (e) => {
    e.preventDefault();
    navigate(`/reports?search=${encodeURIComponent(query)}`);
  };

  return (
    <AppBar
      position="fixed"
      elevation={0}
      color="default"
      sx={(theme) => ({
        height: APPBAR_HEIGHT,
        borderBottom: `1px solid ${theme.palette.divider}`,
        bgcolor: "background.paper",
        left: leftOffset,
        width: {
          xs: "100%",
          sm: `calc(100% - ${collapsed ? collapsedWidth : width}px)`,
        },
        transition: theme.transitions.create(["left", "width"], {
          easing: theme.transitions.easing.sharp,
          duration: theme.transitions.duration.shortest,
        }),
      })}
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
        <Breadcrumbs
          aria-label="breadcrumb"
          sx={{
            flexShrink: 1,
            minWidth: 0,
            "& ol": {
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            },
            display: { xs: "none", sm: "flex" },
          }}
        >
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
          sx={{ width: { xs: 180, sm: 280, md: 360 } }}
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
                    <IconButton edge="end" type="submit" aria-label="Search">
                      <SearchIcon />
                    </IconButton>
                  </InputAdornment>
                ),
              },
            }}
          />
        </Box>
        
      </Toolbar>
    </AppBar>
  );
}

AppHeader.propTypes = {
  collapsed: PropTypes.bool.isRequired,
  onToggle: PropTypes.func.isRequired,
  width: PropTypes.number,
  collapsedWidth: PropTypes.number,
};