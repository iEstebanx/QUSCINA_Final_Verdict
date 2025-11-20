// Frontend/src/pages/Settings/AuthorizationPins/AuthorizationPinPage.jsx
import {
  Box,
  Paper,
  Typography,
  Stack,
  Switch,
  FormControlLabel,
  Button,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Chip,
} from "@mui/material";

const MOCK_ACTIONS = [
  { key: "void_order", label: "Void order", required: true },
  { key: "refund", label: "Refund transaction", required: true },
  { key: "open_shift", label: "Open shift without denomination", required: false },
  { key: "price_override", label: "Override item price", required: false },
];

export default function AuthorizationPinsPage() {
  return (
    <Box sx={{ p: 2, maxWidth: 960, mx: "auto", display: "grid", gap: 2 }}>
      <Typography variant="h5" fontWeight={600}>
        Authorization Pins
      </Typography>

      {/* Global policy */}
      <Paper sx={{ p: 2.5, display: "grid", gap: 2 }}>
        <Box>
          <Typography variant="subtitle1" fontWeight={600}>
            Global PIN policy
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Control how approval PINs are used across the system.
          </Typography>
        </Box>

        <Stack spacing={1.5}>
          <FormControlLabel
            control={<Switch defaultChecked />}
            label="Require authorization PIN for sensitive actions"
          />
          <FormControlLabel
            control={<Switch defaultChecked />}
            label="Allow managers to use their login PIN as authorization PIN"
          />
        </Stack>
      </Paper>

      {/* Action matrix */}
      <Paper sx={{ p: 2.5, display: "grid", gap: 2 }}>
        <Box>
          <Typography variant="subtitle1" fontWeight={600}>
            Action approvals
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Configure which actions require an authorization PIN.
          </Typography>
        </Box>

        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Action</TableCell>
              <TableCell align="center">Requires PIN</TableCell>
              <TableCell align="right">Roles</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {MOCK_ACTIONS.map((row) => (
              <TableRow key={row.key}>
                <TableCell>{row.label}</TableCell>
                <TableCell align="center">
                  <Chip
                    label={row.required ? "Required" : "Optional"}
                    size="small"
                    color={row.required ? "error" : "default"}
                    variant={row.required ? "filled" : "outlined"}
                  />
                </TableCell>
                <TableCell align="right">
                  {/* Just a placeholder for now */}
                  <Typography variant="body2" color="text.secondary">
                    All managers
                  </Typography>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 1 }}>
          <Button variant="outlined" size="small">
            Edit role access
          </Button>
        </Box>
      </Paper>

      {/* Actions */}
      <Paper sx={{ p: 2, display: "flex", justifyContent: "flex-end" }}>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" size="small">
            Cancel
          </Button>
          <Button variant="contained" size="small">
            Save changes
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
}