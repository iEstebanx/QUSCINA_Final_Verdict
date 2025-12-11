import { Box, Paper, Typography, Divider, Stack } from "@mui/material";
import logo from "@/assets/LOGO.png";

export default function QuscinasMemoPage() {
  return (
    <Box sx={{ p: 2, maxWidth: 900, mx: "auto" }}>
      <Paper
        elevation={1}
        sx={{
          p: { xs: 2, sm: 3, md: 4 },
          borderRadius: 2,
          border: (theme) =>
            `1px solid ${
              theme.palette.mode === "light"
                ? "rgba(0,0,0,0.06)"
                : "rgba(255,255,255,0.12)"
            }`,
        }}
      >
        {/* Header with logo + restaurant name */}
        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
          <Box
            component="img"
            src={logo}
            alt="Quscina logo"
            sx={{ width: 64, height: 64, objectFit: "contain" }}
          />
          <Typography variant="h5" fontWeight={700}>
            QUSCINA RESTAURANT
          </Typography>
        </Stack>

        <Typography
          variant="h6"
          fontWeight={700}
          sx={{ mt: 1, mb: 2, textTransform: "uppercase" }}
        >
          Memorandum
        </Typography>

        {/* To / From / Subject */}
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2">
            <strong>To:</strong> All Staff of the Quscina Restaurant
          </Typography>
          <Typography variant="body2">
            <strong>From:</strong> Management
          </Typography>
          <Typography variant="body2">
            <strong>Subject:</strong> Standard Weights of Raw Ingredients Per Pack
          </Typography>
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* Purpose */}
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle1" fontWeight={700} gutterBottom>
            Purpose
          </Typography>
          <Typography variant="body2">
            This memo serves as a fixed reference guide for the standard weight of all
            raw ingredients stored and counted by pack. These measurements must be used
            during receiving, storage, preparation, and inventory counting to ensure
            accuracy and consistency.
          </Typography>
        </Box>

        {/* Standard Weights */}
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle1" fontWeight={700} gutterBottom>
            Standard Weights of Raw Ingredients (Per Pack)
          </Typography>

          <Typography variant="body2" sx={{ mt: 1 }}>
            - Pork Tapa – 1 pack: <strong>1.0 kg</strong>
          </Typography>
          <Typography variant="body2">
            - Chicken Leg Quarter – 1 pack: <strong>1 pcs</strong>
          </Typography>
          <Typography variant="body2">
            - Cream Dory – 1 pack: <strong>500g</strong>
          </Typography>
          <Typography variant="body2">
            - Ground Pork – 1 pack: <strong>500g</strong>
          </Typography>
          <Typography variant="body2">
            - Pork Belly – 1 pack: <strong>1 kg</strong>
          </Typography>
          <Typography variant="body2">
            - Pork Chop – 1 pack: <strong>7 slices</strong>
          </Typography>
          <Typography variant="body2">
            - Pork Liempo – 1 pack: <strong>1.0 kg</strong>
          </Typography>
          <Typography variant="body2">
            - Pork Pata – 1 pack: <strong>1 pcs</strong>
          </Typography>
          <Typography variant="body2">
            - Egg – <strong>1 pcs</strong>
          </Typography>
          <Typography variant="body2">
            - Beef Sirloin – 1 pack: <strong>1.0 kg</strong>
          </Typography>
          <Typography variant="body2">
            - Beef Cubes – 1 pack: <strong>1.0 kg</strong>
          </Typography>
          <Typography variant="body2">
            - Beef Ribs – 1 pack: <strong>1.0 kg</strong>
          </Typography>
          <Typography variant="body2">
            - Bacon – 1 pack: <strong>500g</strong>
          </Typography>
          <Typography variant="body2">
            - Bulaklak – 1 pack: <strong>500g</strong>
          </Typography>
        </Box>

        {/* Compliance */}
        <Box>
          <Typography variant="subtitle1" fontWeight={700} gutterBottom>
            Compliance
          </Typography>
          <Typography variant="body2">
            All employees involved in inventory, storage, and food preparation must
            strictly follow the pack weights listed. This ensures accurate stock levels,
            reduces waste, and maintains proper costing.
          </Typography>
        </Box>
      </Paper>
    </Box>
  );
}