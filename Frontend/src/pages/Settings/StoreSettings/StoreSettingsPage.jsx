// Frontend/src/pages/Settings/StoreSettings/StoreSettingsPage.jsx
import {
  Box,
  Paper,
  Typography,
  TextField,
  Grid,
  Stack,
  Button,
} from "@mui/material";

export default function StoreSettingsPage() {
  return (
    <Box sx={{ p: 2, maxWidth: 960, mx: "auto", display: "grid", gap: 2 }}>
      <Typography variant="h5" fontWeight={600}>
        Store Settings
      </Typography>

      {/* Basic Details */}
      <Paper sx={{ p: 2.5, display: "grid", gap: 2 }}>
        <Box>
          <Typography variant="subtitle1" fontWeight={600}>
            Basic information
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Store identity shown on receipts, reports, and dashboards.
          </Typography>
        </Box>

        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Store Name"
              size="small"
              placeholder="e.g. Quscina Bistro"
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Branch / Location"
              size="small"
              placeholder="e.g. Main Branch"
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Address"
              size="small"
              placeholder="Street, city, province"
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Contact Number"
              size="small"
              placeholder="+63 9xx xxx xxxx"
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Email"
              size="small"
              placeholder="store@example.com"
            />
          </Grid>
        </Grid>
      </Paper>

      {/* Regional & Time */}
      <Paper sx={{ p: 2.5, display: "grid", gap: 2 }}>
        <Box>
          <Typography variant="subtitle1" fontWeight={600}>
            Regional settings
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Timezone and formatting used across reports and POS.
          </Typography>
        </Box>

        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              select
              SelectProps={{ native: true }}
              label="Timezone"
              size="small"
              defaultValue="Asia/Manila"
            >
              <option value="Asia/Manila">Asia/Manila (GMT+8)</option>
              <option value="Asia/Singapore">Asia/Singapore (GMT+8)</option>
              <option value="Asia/Tokyo">Asia/Tokyo (GMT+9)</option>
            </TextField>
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              select
              SelectProps={{ native: true }}
              label="Currency"
              size="small"
              defaultValue="PHP"
            >
              <option value="PHP">PHP – Philippine Peso</option>
              <option value="USD">USD – US Dollar</option>
            </TextField>
          </Grid>
        </Grid>
      </Paper>

      {/* Receipts */}
      <Paper sx={{ p: 2.5, display: "grid", gap: 2 }}>
        <Box>
          <Typography variant="subtitle1" fontWeight={600}>
            Receipt footer
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Message printed at the bottom of every receipt.
          </Typography>
        </Box>

        <TextField
          fullWidth
          multiline
          minRows={3}
          size="small"
          placeholder="Thank you for dining with us!"
        />
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