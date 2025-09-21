// Frontend/src/pages/Settings/PaymentTypes/PaymentTypePage.jsx
import { useMemo, useState } from "react";
import {
  Box,
  Paper,
  Stack,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";

function newId() {
  return `pt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function PaymentTypePage() {
  // Data
  const [rows, setRows] = useState([
    { id: newId(), name: "Cash" },
    { id: newId(), name: "Card" },
  ]);

  // Selection (header checkbox like DiscountPage)
  const [selected, setSelected] = useState([]);
  const allChecked = rows.length > 0 && rows.every((r) => selected.includes(r.id));
  const someChecked = rows.some((r) => selected.includes(r.id)) && !allChecked;

  const toggleAll = () => {
    const ids = rows.map((r) => r.id);
    const everyIncluded = ids.every((id) => selected.includes(id));
    setSelected((s) =>
      everyIncluded ? s.filter((id) => !ids.includes(id)) : Array.from(new Set([...s, ...ids]))
    );
  };
  const toggleOne = (id) => {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  // Dialog (create only)
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const nameError = name.trim().length === 0;

  const onSave = () => {
    if (nameError) return;
    setRows((prev) => [...prev, { id: newId(), name: name.trim() }]);
    setName("");
    setOpen(false);
  };

  const displayRows = useMemo(() => rows, [rows]);

  return (
    <Box p={2} display="grid" gap={2}>
      <Paper sx={{ overflow: "hidden" }}>
        {/* Header (consistent with other pages) */}
        <Box p={2}>
          <Stack
            direction="row"
            useFlexGap
            alignItems="center"
            flexWrap="wrap"
            rowGap={1.5}
            columnGap={2}
            sx={{ minWidth: 0 }}
          >
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setOpen(true)}
              sx={{ flexShrink: 0 }}
            >
              Add Payment Type
            </Button>

            <Box sx={{ flexGrow: 1, minWidth: 0 }} />
          </Stack>
        </Box>

        <Divider />

        {/* Table area (mirrors container/sticky approach) */}
        <Box p={2} sx={{ minWidth: 0 }}>
          <TableContainer
            component={Paper}
            elevation={0}
            className="scroll-x"
            sx={{
              mx: "auto",
              width: { xs: "100%", sm: "auto" },
              maxWidth: 720,
              borderRadius: 2,
            }}
          >
            <Table
              stickyHeader
              aria-label="payment types table"
              sx={{ tableLayout: "fixed", minWidth: 520 }}
            >
              {/* Column sizing (rendered from array to avoid whitespace text nodes) */}
              <colgroup>
                {[56, null].map((w, i) => (
                  <col key={i} style={w ? { width: w } : undefined} />
                ))}
              </colgroup>

              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={allChecked}
                      indeterminate={someChecked}
                      onChange={toggleAll}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography fontWeight={600}>Name</Typography>
                  </TableCell>
                </TableRow>
              </TableHead>

              <TableBody>
                {displayRows.map((r) => (
                  <TableRow
                    key={r.id}
                    hover
                    sx={(theme) => ({
                      cursor: "default",
                      "&:hover": { backgroundColor: alpha(theme.palette.primary.main, 0.04) },
                    })}
                  >
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={selected.includes(r.id)}
                        onChange={() => toggleOne(r.id)}
                      />
                    </TableCell>
                    <TableCell sx={{ overflow: "hidden" }}>
                      <Typography noWrap title={r.name}>
                        {r.name}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}

                {displayRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={2}>
                      <Box py={6} textAlign="center">
                        <Typography variant="body2" color="text.secondary">
                          No payment types yet. Click <strong>Add Payment Type</strong> to create one.
                        </Typography>
                      </Box>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      </Paper>

      {/* Create dialog */}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>
          <Typography variant="h6" fontWeight={800}>
            Add Payment Type
          </Typography>
        </DialogTitle>
        <Divider />
        <DialogContent>
          <Box mt={1}>
            <TextField
              autoFocus
              label="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              error={name.length > 0 && nameError}
              helperText={name.length > 0 && nameError ? "Please enter a name." : " "}
              onKeyDown={(e) => e.key === "Enter" && onSave()}
              fullWidth
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button variant="outlined" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="contained" onClick={onSave} disabled={nameError}>
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}