// Frontend/src/components/Header/AppHeader.jsx
import { useMemo, useState } from "react";
import PropTypes from "prop-types";
import { useLocation, Link as RouterLink } from "react-router-dom";
import {
  AppBar,
  Toolbar,
  Box,
  Breadcrumbs,
  Link,
  Typography,
  IconButton,
  Badge,
  Menu,
  MenuItem,
  ListItemText,
  ListItemIcon,
  Divider,
  Tooltip,
  Chip,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import NotificationsNoneIcon from "@mui/icons-material/NotificationsNone";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import LocalOfferIcon from "@mui/icons-material/LocalOffer";
import RestaurantMenuIcon from "@mui/icons-material/RestaurantMenu";
import HistoryIcon from "@mui/icons-material/History";

// export once and reuse everywhere
export const APPBAR_HEIGHT = 64;

export default function AppHeader({
  collapsed,
  onToggle,
  width = 240,
  collapsedWidth = 72,
}) {
  const location = useLocation();

  // --- Mock notifications (replace with API later) ---
  // type Notif = { id, title, body, kind, href, time, unread }
  const [notifications, setNotifications] = useState([
    {
      id: "n1",
      title: "Low stock: Mozzarella",
      body: "Only 4 packs left in Inventory > Ingredients.",
      kind: "inventory",
      href: "/inventory",
      time: "2m",
      unread: true,
    },
    {
      id: "n2",
      title: "Category rename complete",
      body: "‘Meats’ propagated to 18 ingredients.",
      kind: "activity",
      href: "/inventory",
      time: "18m",
      unread: true,
    },
    {
      id: "n3",
      title: "New menu item added",
      body: "‘Chicken Alfredo’ in Menu > Items.",
      kind: "menu",
      href: "/menu/items",
      time: "1h",
      unread: false,
    },
    {
      id: "n4",
      title: "Discount scheduled",
      body: "‘Happy Hour’ starts at 5:00 PM.",
      kind: "discount",
      href: "/settings/discounts",
      time: "3h",
      unread: false,
    },
  ]);
  const unreadCount = useMemo(
    () => notifications.filter((n) => n.unread).length,
    [notifications]
  );

  // Menu anchor state
  const [anchorEl, setAnchorEl] = useState(null);
  const openMenu = (e) => setAnchorEl(e.currentTarget);
  const closeMenu = () => setAnchorEl(null);

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, unread: false })));
  };

  const iconForKind = (kind) => {
    switch (kind) {
      case "inventory":
        return <Inventory2Icon fontSize="small" />;
      case "discount":
        return <LocalOfferIcon fontSize="small" />;
      case "menu":
        return <RestaurantMenuIcon fontSize="small" />;
      case "activity":
      default:
        return <HistoryIcon fontSize="small" />;
    }
  };

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

      let label = labelMap[seg] || seg.replace(/-/g, " ");
      label = label.charAt(0).toUpperCase() + label.slice(1);

      if (isLast) {
        return (
          <Typography key={pathAcc} color="text.primary">
            {label}
          </Typography>
        );
      }

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

  const leftOffset = {
    xs: 0,
    sm: collapsed ? `${collapsedWidth}px` : `${width}px`,
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

        {/* Notifications (right corner) */}
        <Tooltip title="Notifications">
          <IconButton
            aria-label="Notifications"
            onClick={openMenu}
            size="large"
            sx={{ ml: 0.5 }}
          >
            <Badge
              color="error"
              badgeContent={unreadCount}
              max={9}
              overlap="circular"
            >
              <NotificationsNoneIcon />
            </Badge>
          </IconButton>
        </Tooltip>

        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={closeMenu}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
          transformOrigin={{ vertical: "top", horizontal: "right" }}
          PaperProps={{
            sx: { width: 360, maxWidth: "calc(100vw - 24px)" },
          }}
        >
          <Box
            sx={{
              px: 2,
              py: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Typography variant="subtitle1">Notifications</Typography>
            <Box sx={{ display: "flex", gap: 1 }}>
              <Chip
                size="small"
                label="Mark all read"
                onClick={markAllRead}
                variant="outlined"
              />
            </Box>
          </Box>
         <Divider component="li" />

          {notifications.length === 0 && (
            <MenuItem disabled>
              <ListItemText primary="You're all caught up!" />
            </MenuItem>
          )}

          {notifications.map((n) => (
            <MenuItem
              key={n.id}
              component={RouterLink}
              to={n.href}
              onClick={() => {
                // mark this one as read when clicked
                setNotifications((prev) =>
                  prev.map((x) =>
                    x.id === n.id ? { ...x, unread: false } : x
                  )
                );
                closeMenu();
              }}
              sx={{
                alignItems: "flex-start",
                gap: 1,
                ...(n.unread && {
                  bgcolor: (t) =>
                    t.palette.mode === "dark"
                      ? "action.selected"
                      : "action.hover",
                }),
              }}
            >
              <ListItemIcon sx={{ minWidth: 32, mt: 0.25 }}>
                {iconForKind(n.kind)}
              </ListItemIcon>
              <ListItemText
                primary={
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      pr: 1,
                    }}
                  >
                    <Typography variant="body1" fontWeight={600} noWrap>
                      {n.title}
                    </Typography>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ ml: "auto" }}
                    >
                      {n.time}
                    </Typography>
                  </Box>
                }
                secondary={
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ whiteSpace: "normal" }}
                  >
                    {n.body}
                  </Typography>
                }
              />
            </MenuItem>
          ))}

          {notifications.length > 0 &&
            [
              <Divider key="menu-footer-divider" component="li" />,
              <MenuItem
                key="menu-view-all"
                component={RouterLink}
                to="/reports" // change to your /notifications page if you add one
                onClick={closeMenu}
                sx={{ justifyContent: "center" }}
              >
                <Typography variant="body2" fontWeight={600}>
                  View all
                </Typography>
              </MenuItem>,
            ]
          }
        </Menu>
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