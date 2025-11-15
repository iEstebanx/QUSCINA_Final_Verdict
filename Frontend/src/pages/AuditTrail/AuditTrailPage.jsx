// Frontend/src/pages/AuditTrail/AuditTrailPage.jsx
import { useState, useMemo, useEffect } from "react";
import {
  Box,
  Paper,
  Stack,
  Divider,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TableContainer,
  TablePagination,
  Typography,
  MenuItem,
  Select,
  InputAdornment,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Grid,
  Chip,
} from "@mui/material";
import PersonIcon from "@mui/icons-material/Person";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import RestaurantMenuIcon from "@mui/icons-material/RestaurantMenu";

export default function AuditTrailPage() {
  const [rows, setRows] = useState([]);

  const [employeeFilter, setEmployeeFilter] = useState("All Employees");
  const [dateFilter, setDateFilter] = useState("Select Date");

  const [pageState, setPageState] = useState({ page: 0, rowsPerPage: 10 });
  const { page, rowsPerPage } = pageState;

  const [selectedRow, setSelectedRow] = useState(null);

  // 🔹 Load audit trail logs from backend
  useEffect(() => {
    loadLogs();
  }, []);

  async function loadLogs() {
    try {
      const res = await fetch("/api/audit-trail");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || body.message || "Failed to load audit logs");
      }
      const data = await res.json();
      if (data.ok && Array.isArray(data.data)) {
        setRows(data.data);
      } else {
        console.warn("Unexpected audit trail response", data);
      }
    } catch (err) {
      console.error("Failed to load audit logs", err);
    }
  }

  const paged = useMemo(() => {
    const start = page * rowsPerPage;
    return rows.slice(start, start + rowsPerPage);
  }, [rows, page, rowsPerPage]);

  const handleRowClick = (row) => {
    setSelectedRow(row);
  };

  const handleCloseDialog = () => {
    setSelectedRow(null);
  };

  const dialogTitle =
    selectedRow?.action === "POS - Void"
      ? "POS - Void Order Details"
      : selectedRow
      ? `${selectedRow.action} Details`
      : "";

  return (
    <Box p={2} display="grid" gap={2}>
      <Paper sx={{ overflow: "hidden" }}>
        {/* Header filters */}
        <Box p={2}>
          <Stack
            direction="row"
            useFlexGap
            alignItems="center"
            flexWrap="wrap"
            rowGap={1.5}
            columnGap={2}
          >
            <Select
              value={employeeFilter}
              onChange={(e) => setEmployeeFilter(e.target.value)}
              size="small"
              displayEmpty
              sx={{ minWidth: 220 }}
              startAdornment={
                <InputAdornment position="start">
                  <PersonIcon fontSize="small" />
                </InputAdornment>
              }
            >
              <MenuItem value="All Employees">All Employees</MenuItem>
              <MenuItem value="Admin">Admin</MenuItem>
              <MenuItem value="Manager">Manager</MenuItem>
              <MenuItem value="Cashier">Cashier</MenuItem>
            </Select>

            <Select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              size="small"
              displayEmpty
              sx={{ minWidth: 200 }}
              startAdornment={
                <InputAdornment position="start">
                  <CalendarMonthIcon fontSize="small" />
                </InputAdornment>
              }
            >
              <MenuItem value="Select Date">Select Date</MenuItem>
              <MenuItem value="Today">Today</MenuItem>
              <MenuItem value="This Week">This Week</MenuItem>
              <MenuItem value="This Month">This Month</MenuItem>
            </Select>
          </Stack>
        </Box>

        <Divider />

        {/* Table */}
        <Box p={2} sx={{ minWidth: 0 }}>
          <TableContainer
            component={Paper}
            elevation={0}
            className="scroll-x"
            sx={{
              mx: "auto",
              width: { xs: "100%", sm: "auto" },
              maxWidth: 1100,
              borderRadius: 2,
            }}
          >
            <Table
              stickyHeader
              aria-label="audit trail table"
              sx={{
                minWidth: 760,
                tableLayout: "fixed",
              }}
            >
              <colgroup>
                <col style={{ width: "30%" }} />
                <col style={{ width: "40%" }} />
                <col style={{ width: "30%" }} />
              </colgroup>

              <TableHead>
                <TableRow>
                  <TableCell>
                    <Typography fontWeight={600}>Employee</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography fontWeight={600}>Action</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography fontWeight={600}>Timestamp</Typography>
                  </TableCell>
                </TableRow>
              </TableHead>

              <TableBody>
                {paged.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3}>
                      <Box py={6} textAlign="center">
                        <Typography variant="body2" color="text.secondary">
                          No audit trail records.
                        </Typography>
                      </Box>
                    </TableCell>
                  </TableRow>
                ) : (
                  paged.map((r) => (
                    <TableRow
                      key={r.id}
                      hover
                      sx={{ cursor: "pointer" }}
                      onClick={() => handleRowClick(r)}
                    >
                      <TableCell>{r.employee}</TableCell>
                      <TableCell sx={{ overflow: "hidden" }}>
                        <Typography noWrap title={r.action}>
                          {r.action}
                        </Typography>
                      </TableCell>
                      <TableCell>{r.timestamp}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>

          <TablePagination
            component="div"
            count={rows.length}
            page={page}
            onPageChange={(_, p) => setPageState((s) => ({ ...s, page: p }))}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) =>
              setPageState({
                page: 0,
                rowsPerPage: parseInt(e.target.value, 10),
              })
            }
            rowsPerPageOptions={[5, 10, 25]}
          />
        </Box>
      </Paper>

      {/* Detail Dialog */}
      <Dialog
        open={!!selectedRow}
        onClose={handleCloseDialog}
        maxWidth="lg"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            minHeight: "60vh",
          },
        }}
      >
        {selectedRow && (
          <>
            <DialogTitle sx={{ pb: 2, pt: 3 }}>
              <Stack direction="row" spacing={2} alignItems="center">
                <Box>
                  <Typography variant="h5" fontWeight={700} gutterBottom>
                    {dialogTitle}
                  </Typography>
                  <Typography variant="body1" color="text.secondary">
                    {selectedRow.detail?.statusMessage}
                  </Typography>
                </Box>
              </Stack>
            </DialogTitle>

            <DialogContent dividers sx={{ py: 3 }}>
              <Grid container spacing={3}>
                {/* Action Details */}
                <Grid item xs={12} md={4}>
                  <Paper
                    variant="outlined"
                    sx={{
                      p: 3,
                      height: "100%",
                      borderRadius: 2,
                      borderColor: "divider",
                    }}
                  >
                    <Typography
                      variant="h6"
                      fontWeight={700}
                      gutterBottom
                      color="primary"
                    >
                      Action Details
                    </Typography>

                    <Stack spacing={2.5} mt={2}>
                      <DetailRow
                        label="Action Type"
                        value={selectedRow.detail?.actionDetails?.actionType}
                      />

                      {selectedRow.detail?.actionDetails?.recipient && (
                        <DetailRow
                          label="Recipient"
                          value={selectedRow.detail.actionDetails.recipient}
                        />
                      )}

                      {selectedRow.detail?.actionDetails?.receiptNo && (
                        <DetailRow
                          label="Receipt No."
                          value={selectedRow.detail.actionDetails.receiptNo}
                        />
                      )}

                      <DetailRow
                        label="Amount Total"
                        value={selectedRow.detail?.actionDetails?.amount || "—"}
                      />

                      <Box>
                        <Typography
                          variant="subtitle2"
                          color="text.secondary"
                          sx={{ mb: 1.5 }}
                        >
                          Reason
                        </Typography>
                        {selectedRow.detail?.actionDetails?.reason ? (
                          <Chip
                            label={selectedRow.detail.actionDetails.reason}
                            size="medium"
                            sx={{
                              borderRadius: 2,
                              fontWeight: 600,
                              px: 1,
                              py: 1.5,
                              fontSize: "0.875rem",
                            }}
                            color="primary"
                            variant="outlined"
                          />
                        ) : (
                          <Typography variant="body1" color="text.secondary">
                            —
                          </Typography>
                        )}
                      </Box>
                    </Stack>
                  </Paper>
                </Grid>

                {/* User Information */}
                <Grid item xs={12} md={4}>
                  <Paper
                    variant="outlined"
                    sx={{
                      p: 3,
                      height: "100%",
                      borderRadius: 2,
                      borderColor: "divider",
                    }}
                  >
                    <Typography
                      variant="h6"
                      fontWeight={700}
                      gutterBottom
                      color="primary"
                    >
                      User Information
                    </Typography>

                    <Stack spacing={2.5} mt={2}>
                      <DetailRow label="Employee" value={selectedRow.employee} />
                      <DetailRow label="Role" value={selectedRow.role || "—"} />
                      <DetailRow
                        label="Timestamp"
                        value={selectedRow.timestamp}
                      />
                    </Stack>
                  </Paper>
                </Grid>

                {/* Affected Data */}
                <Grid item xs={12} md={4}>
                  <Paper
                    variant="outlined"
                    sx={{
                      p: 3,
                      height: "100%",
                      borderRadius: 2,
                      borderColor: "divider",
                    }}
                  >
                    <Typography
                      variant="h6"
                      fontWeight={700}
                      gutterBottom
                      color="primary"
                    >
                      Affected Data
                    </Typography>

                    <Box mt={2}>
                      <Typography
                        variant="subtitle2"
                        color="text.secondary"
                        sx={{ mb: 2 }}
                      >
                        Items
                      </Typography>
                      {selectedRow.detail?.affectedData?.items?.length ? (
                        <Stack spacing={1.5}>
                          {selectedRow.detail.affectedData.items.map(
                            (it, idx) => (
                              <Box
                                key={idx}
                                sx={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                  py: 1,
                                  px: 1.5,
                                  borderRadius: 1,
                                  bgcolor: "action.hover",
                                }}
                              >
                                <Typography variant="body1">
                                  {it.name}
                                </Typography>
                                <Typography variant="body1" fontWeight={700}>
                                  {it.qty > 0 ? `(${it.qty}x)` : ""}
                                </Typography>
                              </Box>
                            )
                          )}
                        </Stack>
                      ) : (
                        <Typography
                          variant="body1"
                          color="text.secondary"
                          sx={{ fontStyle: "italic" }}
                        >
                          No items affected
                        </Typography>
                      )}
                    </Box>

                    <Box mt={3}>
                      <Typography
                        variant="subtitle2"
                        color="text.secondary"
                        sx={{ mb: 1.5 }}
                      >
                        Status Change
                      </Typography>
                      <Chip
                        label={
                          selectedRow.detail?.affectedData?.statusChange || "—"
                        }
                        size="medium"
                        sx={{
                          borderRadius: 2,
                          fontWeight: 700,
                          px: 2,
                          py: 1,
                          fontSize: "0.875rem",
                        }}
                        color="success"
                      />
                    </Box>
                  </Paper>
                </Grid>

              </Grid>
            </DialogContent>

            <DialogActions sx={{ px: 3, py: 2.5 }}>
              <Button
                onClick={handleCloseDialog}
                variant="contained"
                size="large"
                sx={{
                  minWidth: 120,
                  borderRadius: 2,
                }}
              >
                Close
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
}

/**
 * Improved DetailRow component with better spacing and typography
 */
function DetailRow({ label, value }) {
  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: 2,
        py: 1,
      }}
    >
      <Typography
        variant="subtitle2"
        color="text.secondary"
        sx={{ minWidth: 120 }}
      >
        {label}
      </Typography>
      <Typography
        variant="body1"
        fontWeight={600}
        sx={{
          textAlign: "right",
          wordBreak: "break-word",
        }}
      >
        {value || "—"}
      </Typography>
    </Box>
  );
}