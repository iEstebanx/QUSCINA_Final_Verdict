// Frontend/src/pages/Settings/Taxes/TaxesPage.jsx
import { useMemo, useState } from "react";
import {
  Box,
  Paper,
  Stack,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TableContainer,
  TextField,
  Checkbox,
  FormControlLabel,
  InputAdornment,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";

export default function TaxesPage() {
  // Single fixed tax: VAT (kept as an array to mirror PaymentTypePage list layout)
  const [rows, setRows] = useState([
    { id: "vat", name: "VAT", rate: 12, applyToNewItems: true },
  ]);

  // Selection (same pattern as PaymentTypePage)
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

  // Dialog (edit VAT)
  const [open, setOpen] = useState(false);
  const vat = rows[0];
  const [draftRate, setDraftRate] = useState(String(vat.rate));
  const [draftApply, setDraftApply] = useState(vat.applyToNewItems);

  const rateNumber = useMemo(() => Number(draftRate), [draftRate]);
  const rateError =
    draftRate.trim() === "" ||
    Number.isNaN(rateNumber) ||
    rateNumber < 0 ||
    rateNumber > 100;

  const openEdit = () => {
    setDraftRate(String(vat.rate));
    setDraftApply(vat.applyToNewItems);
    setOpen(true);
  };

  const save = () => {
    if (rateError) return;
    setRows((prev) =>
      prev.map((r) =>
        r.id === "vat"
          ? { ...r, rate: Number(parseFloat(draftRate).toFixed(2)), applyToNewItems: draftApply }
          : r
      )
    );
    setOpen(false);
  };

  const displayRows = useMemo(() => rows, [rows]);

  return (
    <Box p={2} display="grid" gap={2}>
      <Paper sx={{ overflow: "hidden" }}>
        {/* Header (same structure as PaymentTypePage) */}
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
            <Button variant="contained" onClick={openEdit} sx={{ flexShrink: 0 }}>
              Edit VAT
            </Button>
            <Box sx={{ flexGrow: 1, minWidth: 0 }} />
          </Stack>
        </Box>

        <Divider />

        {/* Table area (mirrors PaymentTypePage container/sticky approach) */}
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
              aria-label="taxes table"
              sx={{ tableLayout: "fixed", minWidth: 560 }}
            >
              {/* Column sizing (rendered from array to avoid whitespace text nodes) */}
              <colgroup>
                {[56, 200, 200, 120].map((w, i) => (
                  <col key={i} style={{ width: w }} />
                ))}
              </colgroup>

              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">
                    <Checkbox checked={allChecked} indeterminate={someChecked} onChange={toggleAll} />
                  </TableCell>
                  <TableCell>
                    <Typography fontWeight={600}>Name</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography fontWeight={600}>Apply to new items</Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography fontWeight={600}>Tax Rate</Typography>
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

                    <TableCell>
                      <Typography>{r.applyToNewItems ? "Yes" : "No"}</Typography>
                    </TableCell>

                    <TableCell align="right">
                      <Typography>
                        {Number(r.rate).toLocaleString(undefined, { maximumFractionDigits: 2 })}%
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}

                {displayRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4}>
                      <Box py={6} textAlign="center">
                        <Typography variant="body2" color="text.secondary">
                          No taxes configured.
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

      {/* Edit dialog (styled like PaymentTypePage dialog) */}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>
          <Typography variant="h6" fontWeight={800}>
            Edit VAT
          </Typography>
        </DialogTitle>
        <Divider />
        <DialogContent>
          <Stack spacing={2} mt={1}>
            <TextField
              label="Tax rate"
              value={draftRate}
              onChange={(e) => setDraftRate(e.target.value)}
              type="number"
              inputProps={{ step: "0.01", min: 0, max: 100 }}
              error={rateError}
              helperText={rateError ? "Enter a value between 0 and 100." : " "}
              InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }}
              fullWidth
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && !rateError && save()}
            />

            <FormControlLabel
              control={
                <Checkbox
                  checked={draftApply}
                  onChange={(e) => setDraftApply(e.target.checked)}
                />
              }
              label="Apply to new items by default"
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button variant="outlined" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="contained" onClick={save} disabled={rateError}>
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}