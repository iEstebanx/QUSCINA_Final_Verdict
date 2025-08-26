// TABLE TEMPLATE // TABLE TEMPLATE // TABLE TEMPLATE // TABLE TEMPLATE // TABLE TEMPLATE 
// TABLE TEMPLATE // TABLE TEMPLATE // TABLE TEMPLATE // TABLE TEMPLATE // TABLE TEMPLATE

// src/pages/ItemList/ItemlistPage.jsx 
import { useState } from "react";
import {
  Box, Paper, Stack, Button, FormControl, InputLabel, Select, MenuItem,
  Table, TableHead, TableBody, TableRow, TableCell, TableContainer,
  Typography, Divider
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";

export default function ItemlistPage() {
  const [category, setCategory] = useState("all");
  const [stockAlert, setStockAlert] = useState("all");
  const rows = [];

  return (
    <Box p={2} display="grid" gap={2}>
      <Paper sx={{ overflow: "hidden" }}>
        <Box p={2}>
          {/* ✅ Responsive header: wraps on small screens and allows children to shrink */}
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
              onClick={() => {}}
              sx={{ flexShrink: 0 }}
            >
              Add Item
            </Button>

            <Box sx={{ flexGrow: 1, minWidth: 0 }} />

            <Stack
              direction="row"
              useFlexGap
              spacing={2}
              flexWrap="wrap"
              sx={{ minWidth: 0 }}
            >
              <FormControl
                size="small"
                sx={{
                  minWidth: { xs: 120, sm: 160 },
                  flex: { xs: "1 1 140px", sm: "0 0 auto" },
                }}
              >
                <InputLabel id="itemlist-category-label">Category</InputLabel>
                <Select
                  labelId="itemlist-category-label"
                  value={category}
                  label="Category"
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <MenuItem value="all">All</MenuItem>
                  <MenuItem value="beverages">Beverages</MenuItem>
                  <MenuItem value="entrees">Entrees</MenuItem>
                  <MenuItem value="desserts">Desserts</MenuItem>
                </Select>
              </FormControl>

              <FormControl
                size="small"
                sx={{
                  minWidth: { xs: 140, sm: 180 },
                  flex: { xs: "1 1 160px", sm: "0 0 auto" },
                }}
              >
                <InputLabel id="itemlist-stock-alert-label">Stock Alert</InputLabel>
                <Select
                  labelId="itemlist-stock-alert-label"
                  value={stockAlert}
                  label="Stock Alert"
                  onChange={(e) => setStockAlert(e.target.value)}
                >
                  <MenuItem value="all">All</MenuItem>
                  <MenuItem value="low">Low Stock</MenuItem>
                  <MenuItem value="out">Out of Stock</MenuItem>
                  <MenuItem value="in">In Stock</MenuItem>
                </Select>
              </FormControl>
            </Stack>
          </Stack>
        </Box>

        <Divider />

        {/* ✅ Table scrolls inside its own container; never widens the page */}
        <Box p={2} sx={{ minWidth: 0 }}>
          <TableContainer
            component={Paper}
            elevation={0}
            className="scroll-x"
            sx={{ width: "100%", borderRadius: 1, maxHeight: 520, overflowX: "auto" }}
          >
            <Table
              stickyHeader
              aria-label="items table"
              // Responsive baseline width; grow as needed
              sx={{ minWidth: { xs: 600, sm: 760, md: 880 } }}
            >
              <TableHead>
                <TableRow>
                  <TableCell>Item Name</TableCell>
                  <TableCell>Category</TableCell>
                  <TableCell align="right">Price</TableCell>
                  <TableCell align="right">Cost</TableCell>
                  <TableCell align="right">Margin</TableCell>
                  <TableCell align="right">In Stock</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <Box py={6} textAlign="center">
                        <Typography variant="body2" color="text.secondary">
                          No items yet. Click <strong>Add Item</strong> to create your first product.
                        </Typography>
                      </Box>
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => (
                    <TableRow key={r.id} hover>
                      <TableCell>{r.name}</TableCell>
                      <TableCell>{r.categoryName}</TableCell>
                      <TableCell align="right">{r.price}</TableCell>
                      <TableCell align="right">{r.cost}</TableCell>
                      <TableCell align="right">{r.margin}</TableCell>
                      <TableCell align="right">{r.inStock}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      </Paper>
    </Box>
  );
}