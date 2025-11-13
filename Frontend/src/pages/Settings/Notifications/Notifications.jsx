// Frontend/src/pages/Settings/Notifications/Notifications.jsx
import { useEffect, useMemo, useState } from "react";
import {
  Box, Paper, Stack, Typography, Divider, Table, TableBody, TableCell, TableContainer,
  TableHead, TablePagination, TableRow, FormControl, InputLabel, Select, MenuItem,
  TextField, InputAdornment, Switch, FormControlLabel
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";

export default function Notifications() {
  const [categories, setCategories] = useState([]);
  const [categoryId, setCategoryId] = useState("");
  const [q, setQ] = useState("");
  const [lowOnly, setLowOnly] = useState(false);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [pageState, setPageState] = useState({ page: 0, rowsPerPage: 10 });
  const { page, rowsPerPage } = pageState;

  const paged = useMemo(() => {
    const start = page * rowsPerPage;
    return rows.slice(start, start + rowsPerPage);
  }, [rows, page, rowsPerPage]);

  const isEmpty = !loading && !err && rows.length === 0;

  async function loadCategories() {
    try {
      const res = await fetch(`/api/categories`, { cache: "no-store", credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.ok && Array.isArray(data.categories)) {
        setCategories(data.categories);
      }
    } catch {}
  }

  async function loadRows() {
    setLoading(true);
    setErr("");
    try {
      const qs = new URLSearchParams();
      if (categoryId) qs.set("categoryId", categoryId);
      if (q) qs.set("q", q);
      if (lowOnly) qs.set("lowOnly", "1");

      const res = await fetch(`/api/settings/notifications/stock-limits?` + qs.toString(), {
        cache: "no-store",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.ok && Array.isArray(data.rows)) {
        setRows(data.rows);
      } else {
        throw new Error(data?.error || `Failed to load (HTTP ${res.status})`);
      }
    } catch (e) {
      setErr(e?.message || "Network error");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCategories();
    loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setPageState((s) => ({ ...s, page: 0 }));
    loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId, q, lowOnly]);

  const moveIdToFront = (arr, id) => {
    const idx = arr.findIndex((x) => x.id === id);
    if (idx <= 0) return arr; // -1 (not found) or already first
    const next = arr.slice();
    const [item] = next.splice(idx, 1);
    next.unshift(item);
    return next;
  };

  async function saveLowStock(id, lowStock) {
    const n = Number(lowStock);
    if (!Number.isFinite(n) || n < 0) return;

    // optimistic update of the value
    setRows((r) => r.map((x) => (x.id === id ? { ...x, lowStock: n } : x)));

    try {
      const res = await fetch(`/api/settings/notifications/stock-limits/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ lowStock: n }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok !== true) throw new Error(data?.error || `HTTP ${res.status}`);

      // ✅ On success: bump this ingredient to the first row, like ingredients.js
      setRows((arr) => moveIdToFront(arr, id));
      setPageState((s) => ({ ...s, page: 0 })); // go back to first page so you see it
    } catch {
      // revert on failure
      loadRows();
    }
  }

  return (
    <Box p={2} display="grid" gap={2}>
      <Paper sx={{ overflow: "hidden" }}>
        <Box p={2}>
          <Stack spacing={2}>
            <Typography variant="h5" fontWeight={800}>Notification</Typography>

            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems="center">
              <FormControl size="small" sx={{ minWidth: 220 }}>
                <InputLabel id="notif-cat-label">Categories</InputLabel>
                <Select
                  labelId="notif-cat-label"
                  label="Categories"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  MenuProps={{ PaperProps: { className: "scroll-x" } }}
                >
                  <MenuItem value="">All categories</MenuItem>
                  {categories.map((c) => (
                    <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>

              <TextField
                size="small"
                placeholder="Search name, category, unit"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                sx={{ width: { xs: "100%", sm: 320 } }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                }}
              />

              <FormControlLabel
                control={<Switch checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} />}
                label="Show low only"
              />
            </Stack>
          </Stack>
        </Box>

        <Divider />

        <Box p={2} sx={{ minWidth: 0 }}>
          <TableContainer component={Paper} elevation={0} className="scroll-x" sx={{ mx: "auto", maxWidth: 900 }}>
            <Table stickyHeader sx={{ tableLayout: "fixed", minWidth: 700 }}>
              <colgroup>
                <col style={{ minWidth: 280 }} />
                <col style={{ width: 130 }} />
                <col style={{ width: 150 }} />
                <col style={{ width: 120 }} />
              </colgroup>

              <TableHead>
                <TableRow>
                  <TableCell><Typography fontWeight={600}>Name</Typography></TableCell>
                  <TableCell align="center"><Typography fontWeight={600}>Current</Typography></TableCell>
                  <TableCell align="center"><Typography fontWeight={600}>Low Stock</Typography></TableCell>
                  <TableCell align="center"><Typography fontWeight={600}>Unit</Typography></TableCell>
                </TableRow>
              </TableHead>

              <TableBody>
                {loading && (
                  <TableRow><TableCell colSpan={4}><Typography variant="body2">Loading…</Typography></TableCell></TableRow>
                )}

                {!!err && !loading && (
                  <TableRow><TableCell colSpan={4}><Typography variant="body2" color="error">{err}</Typography></TableCell></TableRow>
                )}

                {isEmpty && (
                  <TableRow><TableCell colSpan={4}><Typography variant="body2" color="text.secondary">No items to show.</Typography></TableCell></TableRow>
                )}

                {!loading && !err && !isEmpty && paged.map((r) => (
                  <TableRow key={r.id} hover>
                    <TableCell sx={{ overflow: "hidden" }}>
                      <Typography noWrap title={r.name}>{r.name}</Typography>
                      <Typography variant="caption" color="text.secondary" noWrap title={r.category}>
                        {r.category}
                      </Typography>
                    </TableCell>

                    <TableCell align="center"><Typography fontWeight={700}>{r.quantity}</Typography></TableCell>

                    <TableCell align="center">
                      <TextField
                        size="small"
                        value={String(r.lowStock ?? "")}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^0-9.]/g, "");
                          setRows((arr) => arr.map(x => x.id === r.id ? { ...x, lowStock: val } : x));
                        }}
                        onBlur={(e) => saveLowStock(r.id, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") e.currentTarget.blur();
                        }}
                        inputMode="decimal"
                        sx={{
                          width: 110,
                          "& .MuiInputBase-input": {
                            fontWeight: 700,            // bold like “Current”
                            color: "text.primary",      // black/dark text
                            textAlign: "center",        // optional: matches numeric feel
                            paddingY: 0.75,             // slightly taller input
                          }
                        }}
                      />
                    </TableCell>

                    <TableCell align="center"><Typography>{r.unit}</Typography></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <TablePagination
            component="div"
            count={rows.length}
            page={page}
            onPageChange={(_, p) => setPageState((s) => ({ ...s, page: p }))}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => setPageState({ page: 0, rowsPerPage: parseInt(e.target.value, 10) })}
            rowsPerPageOptions={[5, 10, 25]}
          />
        </Box>
      </Paper>
    </Box>
  );
}