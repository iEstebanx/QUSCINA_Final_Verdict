// Frontend/src/pages/AuditTrail/AuditTrailPage.jsx
import { useState, useMemo } from "react";
import {
  Box, Paper, Stack, Divider, Table, TableHead, TableRow, TableCell,
  TableBody, TableContainer, TablePagination, Typography, MenuItem, Select, InputAdornment
} from "@mui/material";
import PersonIcon from "@mui/icons-material/Person";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";

export default function AuditTrailPage() {
  const [rows] = useState([
    { id: 1, employee: "Cashier",        action: "POS - Pay In",       timestamp: "Apr 11, 2025 01:20 PM" },
    { id: 2, employee: "Administrator",  action: "New Item",           timestamp: "Apr 09, 2025 09:41 AM" },
    { id: 3, employee: "Manager",        action: "Settings Changes",   timestamp: "Apr 09, 2025 10:20 AM" },
    { id: 4, employee: "Administrator",  action: "Perform Backup",     timestamp: "Mar 07, 2025 08:20 AM" },
    { id: 5, employee: "Cashier",        action: "POS - Void",         timestamp: "Apr 11, 2025 01:20 PM" },
  ]);

  const [employeeFilter, setEmployeeFilter] = useState("All Employees");
  const [dateFilter, setDateFilter] = useState("Select Date");

  const [pageState, setPageState] = useState({ page: 0, rowsPerPage: 10 });
  const { page, rowsPerPage } = pageState;

  const paged = useMemo(() => {
    const start = page * rowsPerPage;
    return rows.slice(start, start + rowsPerPage);
  }, [rows, page, rowsPerPage]);

  return (
    <Box p={2} display="grid" gap={2}>
      <Paper sx={{ overflow: "hidden" }}>
        {/* Header filters */}
        <Box p={2}>
          <Stack direction="row" useFlexGap alignItems="center" flexWrap="wrap" rowGap={1.5} columnGap={2}>
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
              <MenuItem value="Administrator">Administrator</MenuItem>
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
                minWidth: { xs: 760, sm: 920, md: 1060 },
                tableLayout: "fixed",
              }}
            >
              {/* Column sizing (rendered from an array to avoid text nodes) */}
              <colgroup>
                {[220, null, 260].map((w, i) => (
                  <col key={i} style={w ? { width: w } : undefined} />
                ))}
              </colgroup>

              <TableHead>
                <TableRow>
                  <TableCell><Typography fontWeight={600}>Employee</Typography></TableCell>
                  <TableCell><Typography fontWeight={600}>Action</Typography></TableCell>
                  <TableCell><Typography fontWeight={600}>Timestamp</Typography></TableCell>
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
                    <TableRow key={r.id} hover>
                      <TableCell>{r.employee}</TableCell>
                      <TableCell sx={{ overflow: "hidden" }}>
                        <Typography noWrap title={r.action}>{r.action}</Typography>
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
              setPageState({ page: 0, rowsPerPage: parseInt(e.target.value, 10) })
            }
            rowsPerPageOptions={[5, 10, 25]}
          />
        </Box>
      </Paper>
    </Box>
  );
}