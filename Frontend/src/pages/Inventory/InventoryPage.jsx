// Frontend/src/pages/Inventory/InventoryPage.jsx
import { Typography } from "@mui/material";
export default function InventoryPage() {
  return <Typography variant="h5">.</Typography>;
}


// // Frontend/src/pages/Inventory/InventoryPage.jsx
// import { useEffect, useMemo, useState } from "react";
// import {
//   Box,
//   Paper,
//   Stack,
//   Button,
//   Dialog,
//   DialogTitle,
//   DialogContent,
//   DialogActions,
//   Divider,
//   Typography,
//   TextField,
//   Table,
//   TableBody,
//   TableCell,
//   TableContainer,
//   TableHead,
//   TablePagination,
//   TableRow,
//   IconButton,
//   InputAdornment,
//   Chip,
//   Radio,
//   RadioGroup,
//   FormControlLabel,
//   FormControl,
//   InputLabel,
//   Select,
//   MenuItem,
//   Tooltip,
// } from "@mui/material";
// import AddIcon from "@mui/icons-material/Add";
// import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
// import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
// import SearchIcon from "@mui/icons-material/Search";
// import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";

// const formatPhp = (n) =>
//   `₱${Number(n || 0).toLocaleString("en-PH", {
//     minimumFractionDigits: 2,
//     maximumFractionDigits: 2,
//   })}`;

// const NOW = () => new Date().toISOString();

// // --- Mock master lists (in-memory only for the mockup)
// const INITIAL_ING = [
//   { id: "ing-1", name: "all purpose cream", type: "RAW", category: "Dairy", currentStock: 25, lowStock: 5, price: 0 },
//   { id: "ing-2", name: "Beef", type: "RAW", category: "Beef", currentStock: 10, lowStock: 3, price: 0 },
//   { id: "ing-3", name: "Pork", type: "RAW", category: "Pork", currentStock: 18, lowStock: 5, price: 0 },
// ];

// const INITIAL_ACTIVITY = [
//   {
//     id: "a-1",
//     ts: "2025-03-15T20:12:00+08:00",
//     employee: "Chef",
//     remarks: "Damage",
//     io: "Out",
//     qty: 45,
//     price: 0,
//   },
//   {
//     id: "a-2",
//     ts: "2025-03-14T08:12:00+08:00",
//     employee: "Chef",
//     remarks: "Inventory Count",
//     io: "In",
//     qty: 215,
//     price: 0,
//   },
// ];

// const INV_CATS_API = "/api/inventory/inv-categories";

// export default function InventoryPage() {
//   // Filters/search/pagination state
//   const [reasonFilter, setReasonFilter] = useState("all");
//   const [query, setQuery] = useState("");
//   const [pageState, setPageState] = useState({ page: 0, rowsPerPage: 10 });

//   // Local “DB”
//   const [ingredients, setIngredients] = useState(INITIAL_ING);
//   const [categories, setCategories] = useState([]); // ← fetched from backend
//   const [activity, setActivity] = useState(INITIAL_ACTIVITY);

//   // Fetch inventory_categories from backend
//   useEffect(() => {
//     let alive = true;
//     (async () => {
//       try {
//         const res = await fetch(INV_CATS_API, { cache: "no-store" });
//         const data = await res.json().catch(() => ({}));
//         if (!res.ok || data?.ok !== true) throw new Error(data?.error || `HTTP ${res.status}`);
//         const names = (data.categories ?? [])
//           .map((c) => String(c?.name || "").trim())
//           .filter(Boolean)
//           .sort((a, b) => a.localeCompare(b));
//         if (alive) setCategories(names);
//       } catch (e) {
//         console.error("[inv-categories] load failed:", e);
//         if (alive) setCategories([]); // fail safe
//       }
//     })();
//     return () => {
//       alive = false;
//     };
//   }, []);

//   // ——— Add Ingredient dialog
//   const [openAdd, setOpenAdd] = useState(false);
//   const [newName, setNewName] = useState("");
//   const [newCat, setNewCat] = useState("");
//   const [newType, setNewType] = useState("DRY");

//   // ——— Stock In/Out dialog
//   const [openStock, setOpenStock] = useState(false);
//   const [stockForm, setStockForm] = useState({
//     ingId: "",
//     cat: "",
//     type: "DRY",
//     direction: "IN",
//     qty: "",
//     current: 0,
//     low: "",
//     price: "",
//     cost: 0,
//     date: "",
//     remarks: "",
//   });

//   // Derived & helpers
//   const filtered = useMemo(() => {
//     const q = query.trim().toLowerCase();
//     return activity.filter((r) => {
//       const reasonOk =
//         reasonFilter === "all" ||
//         (reasonFilter === "damage" && r.remarks?.toLowerCase().includes("damage")) ||
//         (reasonFilter === "inventory" && r.remarks?.toLowerCase().includes("inventory"));
//       const qOk =
//         !q ||
//         [r.employee, r.remarks, r.io, String(r.qty)]
//           .join(" ")
//           .toLowerCase()
//           .includes(q);
//       return reasonOk && qOk;
//     });
//   }, [activity, query, reasonFilter]);

//   useEffect(() => {
//     // reset page when filters change
//     setPageState((s) => ({ ...s, page: 0 }));
//   }, [reasonFilter, query]);

//   const paged = useMemo(() => {
//     const start = pageState.page * pageState.rowsPerPage;
//     return filtered.slice(start, start + pageState.rowsPerPage);
//   }, [filtered, pageState]);

//   // ——— Add Ingredient handlers
//   const handleAddIngredient = () => {
//     if (!newName.trim()) return;
//     const id = `ing-${Date.now()}`;

//     // Do NOT mutate categories here; they come from Firestore now.
//     setIngredients((list) => [
//       ...list,
//       {
//         id,
//         name: newName.trim(),
//         type: newType,
//         category: newCat || "Uncategorized",
//         currentStock: 0,
//         lowStock: 0,
//         price: 0,
//       },
//     ]);
//     // reset & close
//     setNewName("");
//     setNewCat("");
//     setNewType("DRY");
//     setOpenAdd(false);
//   };

//   // ——— Stock In/Out handlers
//   const openStockDialog = () => {
//     setStockForm({
//       ingId: "",
//       cat: "",
//       type: "DRY",
//       direction: "IN",
//       qty: "",
//       current: 0,
//       low: "",
//       price: "",
//       cost: 0,
//       date: "",
//       remarks: "",
//     });
//     setOpenStock(true);
//   };

//   const onPickIngredient = (id) => {
//     const ing = ingredients.find((i) => i.id === id);
//     setStockForm((f) => ({
//       ...f,
//       ingId: id,
//       cat: ing?.category || "",
//       type: ing?.type || "DRY",
//       current: ing?.currentStock || 0,
//       price: ing?.price || "",
//     }));
//   };

//   const recalcCost = (qty, price) => {
//     const qn = Number(qty || 0);
//     const pn = Number(price || 0);
//     return qn * pn;
//   };

//   const handleStockSave = () => {
//     // purely mock insert into activity table
//     const qty = Number(stockForm.qty || 0);
//     const price = Number(stockForm.price || 0);
//     const item = {
//       id: `a-${Date.now()}`,
//       ts: stockForm.date ? new Date(stockForm.date).toISOString() : NOW(),
//       employee: "Chef", // mock
//       remarks: stockForm.remarks || (stockForm.direction === "IN" ? "Stock In" : "Stock Out"),
//       io: stockForm.direction === "IN" ? "In" : "Out",
//       qty,
//       price,
//     };
//     setActivity((a) => [item, ...a]);

//     // update current stock in our local ingredients list (mock)
//     if (stockForm.ingId) {
//       setIngredients((arr) =>
//         arr.map((i) => {
//           if (i.id !== stockForm.ingId) return i;
//           const delta = stockForm.direction === "IN" ? qty : -qty;
//           return {
//             ...i,
//             currentStock: Math.max(0, (i.currentStock || 0) + delta),
//             // lowStock remains unchanged (field disabled)
//             lowStock: i.lowStock ?? 0,
//             price,
//           };
//         })
//       );
//     }
//     setOpenStock(false);
//   };

//   const isOut = stockForm.direction === "OUT"; // still used for the label toggle

//   return (
//     <Box p={2} display="grid" gap={2}>
//       <Paper sx={{ overflow: "hidden" }}>
//         {/* Header row: actions + filters + search (mirrors DiscountPage pattern) */}
//         <Box p={2}>
//           <Stack
//             direction="row"
//             useFlexGap
//             alignItems="center"
//             flexWrap="wrap"
//             rowGap={1.5}
//             columnGap={2}
//             sx={{ minWidth: 0 }}
//           >
//             <Button
//               variant="contained"
//               startIcon={<AddIcon />}
//               onClick={() => setOpenAdd(true)}
//               sx={{ flexShrink: 0 }}
//             >
//               ADD ING
//             </Button>

//             <Button
//               variant="contained"
//               color="success"
//               startIcon={<Inventory2OutlinedIcon />}
//               onClick={openStockDialog}
//               sx={{ flexShrink: 0 }}
//             >
//               STOCK IN/OUT
//             </Button>

//             <FormControl
//               size="small"
//               sx={{
//                 minWidth: { xs: 160, sm: 200 },
//                 flex: { xs: "1 1 160px", sm: "0 0 auto" },
//               }}
//             >
//               <InputLabel id="reason-label">All Reason</InputLabel>
//               <Select
//                 labelId="reason-label"
//                 label="All Reason"
//                 value={reasonFilter}
//                 onChange={(e) => setReasonFilter(e.target.value)}
//                 IconComponent={KeyboardArrowDownIcon}
//               >
//                 <MenuItem value="all">All Reason</MenuItem>
//                 <MenuItem value="inventory">Inventory Count</MenuItem>
//                 <MenuItem value="damage">Damage</MenuItem>
//               </Select>
//             </FormControl>

//             <Box sx={{ flexGrow: 1, minWidth: 0 }} />

//             <TextField
//               size="small"
//               placeholder="Search"
//               value={query}
//               onChange={(e) => setQuery(e.target.value)}
//               sx={{ width: { xs: "100%", sm: 320 }, flex: { xs: "1 1 220px", sm: "0 0 auto" } }}
//               InputProps={{
//                 startAdornment: (
//                   <InputAdornment position="start">
//                     <SearchIcon fontSize="small" />
//                   </InputAdornment>
//                 ),
//               }}
//             />
//           </Stack>
//         </Box>

//         <Divider />

//         {/* Table area */}
//         <Box p={2} sx={{ minWidth: 0 }}>
//           <TableContainer
//             component={Paper}
//             elevation={0}
//             className="scroll-x"
//             sx={{ width: "100%", maxWidth: "100%" }}
//           >
//             <Table stickyHeader sx={{ tableLayout: "fixed", minWidth: 900 }}>
//               <colgroup>
//                 <col style={{ width: 180 }} />
//                 <col style={{ width: 120 }} />
//                 <col style={{ width: 200 }} />
//                 <col style={{ width: 120 }} />
//                 <col style={{ width: 100 }} />
//                 <col style={{ width: 120 }} />
//                 <col style={{ width: 140 }} />
//               </colgroup>

//               <TableHead>
//                 <TableRow>
//                   <TableCell>
//                     <Typography fontWeight={600}>Date &amp; Time</Typography>
//                   </TableCell>
//                   <TableCell>
//                     <Typography fontWeight={600}>Employee</Typography>
//                   </TableCell>
//                   <TableCell>
//                     <Typography fontWeight={600}>Remarks</Typography>
//                   </TableCell>
//                   <TableCell>
//                     <Typography fontWeight={600}>Stockin/Out</Typography>
//                   </TableCell>
//                   <TableCell>
//                     <Typography fontWeight={600}>Quantity</Typography>
//                   </TableCell>
//                   <TableCell>
//                     <Typography fontWeight={600}>Per Price</Typography>
//                   </TableCell>
//                   <TableCell>
//                     <Typography fontWeight={600}>Cost Overall</Typography>
//                   </TableCell>
//                 </TableRow>
//               </TableHead>

//               <TableBody>
//                 {paged.map((r) => {
//                   const dt = new Date(r.ts);
//                   const date = dt.toLocaleDateString("en-US", {
//                     month: "short",
//                     day: "2-digit",
//                     year: "numeric",
//                   });
//                   const time = dt.toLocaleTimeString("en-US", {
//                     hour: "2-digit",
//                     minute: "2-digit",
//                   });
//                   const cost = (Number(r.qty || 0) * Number(r.price || 0)) || 0;

//                   return (
//                     <TableRow key={r.id} hover>
//                       <TableCell>
//                         <Stack spacing={0.5}>
//                           <Typography variant="body2" fontWeight={600}>
//                             {date}
//                           </Typography>
//                           <Typography variant="caption" color="text.secondary">
//                             {time}
//                           </Typography>
//                         </Stack>
//                       </TableCell>
//                       <TableCell>
//                         <Typography>Chef</Typography>
//                       </TableCell>
//                       <TableCell>
//                         <Typography>{r.remarks}</Typography>
//                       </TableCell>
//                       <TableCell>
//                         <Chip
//                           size="small"
//                           label={r.io}
//                           color={r.io === "In" ? "success" : "error"}
//                           variant="outlined"
//                         />
//                       </TableCell>
//                       <TableCell>
//                         <Typography fontWeight={700}>{r.qty}</Typography>
//                       </TableCell>
//                       <TableCell>
//                         <Typography>{formatPhp(r.price)}</Typography>
//                       </TableCell>
//                       <TableCell>
//                         <Typography fontWeight={700}>{formatPhp(cost)}</Typography>
//                       </TableCell>
//                     </TableRow>
//                   );
//                 })}

//                 {filtered.length === 0 && (
//                   <TableRow>
//                     <TableCell colSpan={7}>
//                       <Box py={6} textAlign="center">
//                         <Typography variant="body2" color="text.secondary">
//                           No records found.
//                         </Typography>
//                       </Box>
//                     </TableCell>
//                   </TableRow>
//                 )}
//               </TableBody>
//             </Table>
//           </TableContainer>

//           <TablePagination
//             component="div"
//             count={filtered.length}
//             page={pageState.page}
//             onPageChange={(_, p) => setPageState((s) => ({ ...s, page: p }))}
//             rowsPerPage={pageState.rowsPerPage}
//             onRowsPerPageChange={(e) =>
//               setPageState({ page: 0, rowsPerPage: parseInt(e.target.value, 10) })
//             }
//             rowsPerPageOptions={[5, 10, 25]}
//           />
//         </Box>
//       </Paper>

//       {/* ---------------- Add Ingredient Dialog ---------------- */}
//       <Dialog
//         open={openAdd}
//         onClose={() => setOpenAdd(false)}
//         maxWidth="xs"
//         fullWidth
//       >
//         <DialogTitle>
//           <Stack alignItems="center" spacing={1}>
//             <Typography variant="h5" fontWeight={800}>
//               Add Ingredient
//             </Typography>
//           </Stack>
//         </DialogTitle>
//         <Divider />
//         <DialogContent>
//           <Stack spacing={2} mt={1}>
//             <TextField
//               label="Name"
//               value={newName}
//               onChange={(e) => setNewName(e.target.value)}
//               autoFocus
//               fullWidth
//             />
//             <FormControl fullWidth>
//               <InputLabel id="cat-label">Categories</InputLabel>
//               <Select
//                 labelId="cat-label"
//                 label="Categories"
//                 value={newCat}
//                 onChange={(e) => setNewCat(e.target.value)}
//               >
//                 <MenuItem value="">
//                   <em>Existing categories</em>
//                 </MenuItem>
//                 {categories.map((c) => (
//                   <MenuItem key={c} value={c}>
//                     {c}
//                   </MenuItem>
//                 ))}
//               </Select>
//             </FormControl>

//             <RadioGroup
//               row
//               value={newType}
//               onChange={(e) => setNewType(e.target.value)}
//             >
//               <FormControlLabel value="DRY" control={<Radio />} label="DRY" />
//               <FormControlLabel value="RAW" control={<Radio />} label="RAW" />
//             </RadioGroup>
//           </Stack>
//         </DialogContent>
//         <DialogActions sx={{ px: 3, pb: 2 }}>
//           <Button variant="outlined" onClick={() => setOpenAdd(false)}>
//             CANCEL
//           </Button>
//           <Button variant="contained" onClick={handleAddIngredient} disabled={!newName.trim()}>
//             ADD
//           </Button>
//         </DialogActions>
//       </Dialog>

//       {/* ---------------- Stock In/Out Dialog ---------------- */}
//       <Dialog
//         open={openStock}
//         onClose={() => setOpenStock(false)}
//         maxWidth="md"
//         fullWidth
//       >
//         <DialogTitle>
//           <Stack alignItems="center" spacing={1}>
//             <Typography variant="h5" fontWeight={800}>
//               Inventory (Stock In/Out)
//             </Typography>
//           </Stack>
//         </DialogTitle>
//         <Divider />
//         <DialogContent>
//           <Stack spacing={2}>
//             <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
//               <FormControl fullWidth>
//                 <InputLabel id="name-label">Name</InputLabel>
//                 <Select
//                   labelId="name-label"
//                   label="Name"
//                   value={stockForm.ingId}
//                   onChange={(e) => onPickIngredient(e.target.value)}
//                 >
//                   {ingredients.map((i) => (
//                     <MenuItem key={i.id} value={i.id}>
//                       {i.name}
//                     </MenuItem>
//                   ))}
//                 </Select>
//               </FormControl>

//               <FormControl fullWidth>
//                 <InputLabel id="cat2-label">Categories</InputLabel>
//                 <Select
//                   labelId="cat2-label"
//                   label="Categories"
//                   value={stockForm.cat}
//                   onChange={(e) => setStockForm((f) => ({ ...f, cat: e.target.value }))}
//                 >
//                   {categories.map((c) => (
//                     <MenuItem key={c} value={c}>
//                       {c}
//                     </MenuItem>
//                   ))}
//                 </Select>
//               </FormControl>
//             </Stack>

//             <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
//               <RadioGroup
//                 row
//                 value={stockForm.type}
//                 onChange={(e) => setStockForm((f) => ({ ...f, type: e.target.value }))}
//               >
//                 <FormControlLabel value="DRY" control={<Radio />} label="DRY" />
//                 <FormControlLabel value="RAW" control={<Radio />} label="RAW" />
//               </RadioGroup>

//               <RadioGroup
//                 row
//                 value={stockForm.direction}
//                 onChange={(e) => setStockForm((f) => ({ ...f, direction: e.target.value }))}
//               >
//                 <FormControlLabel value="IN" control={<Radio />} label="STOCK IN" />
//                 <FormControlLabel value="OUT" control={<Radio />} label="STOCK OUT" />
//               </RadioGroup>
//             </Stack>

//             <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
//               <TextField
//                 label={isOut ? "Stock Out" : "Stock In"}
//                 value={stockForm.qty}
//                 onChange={(e) => {
//                   const qty = e.target.value.replace(/\D/g, "");
//                   setStockForm((f) => ({
//                     ...f,
//                     qty,
//                     cost: recalcCost(qty, f.price),
//                   }));
//                 }}
//                 inputMode="numeric"
//                 fullWidth
//               />
//               <TextField
//                 label="Current Stock"
//                 value={stockForm.current}
//                 InputProps={{ readOnly: true }}
//                 fullWidth
//               />
//               {/* Low Stock: fully disabled */}
//               <TextField
//                 label="Low Stock"
//                 value={stockForm.low}
//                 helperText="Inventory quantity at which you will be notified about low stock"
//                 inputMode="numeric"
//                 disabled
//                 fullWidth
//               />
//             </Stack>

//             <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
//               <TextField
//                 label="Remarks"
//                 value={stockForm.remarks}
//                 onChange={(e) => setStockForm((f) => ({ ...f, remarks: e.target.value }))}
//                 fullWidth
//               />
//             </Stack>

//             <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
//               <TextField
//                 label="Price per Item"
//                 value={stockForm.price}
//                 onChange={(e) => {
//                   const price = e.target.value.replace(/[^0-9.]/g, "");
//                   setStockForm((f) => ({ ...f, price, cost: recalcCost(f.qty, price) }));
//                 }}
//                 slotProps={{
//                   input: {
//                     startAdornment: <InputAdornment position="start">₱</InputAdornment>,
//                   },
//                 }}
//                 inputMode="decimal"
//                 fullWidth
//               />
//               <TextField
//                 label="Cost"
//                 value={formatPhp(stockForm.cost)}
//                 InputProps={{ readOnly: true }}
//                 fullWidth
//               />
//               <TextField
//                 label="Date"
//                 type="date"
//                 value={stockForm.date}
//                 onChange={(e) => setStockForm((f) => ({ ...f, date: e.target.value }))}
//                 fullWidth
//                 slotProps={{
//                   inputLabel: { shrink: true },
//                 }}
//               />
//             </Stack>
//           </Stack>
//         </DialogContent>

//         <DialogActions sx={{ px: 3, pb: 2 }}>
//           <Tooltip title="(Mock) Delete current record – disabled in mockup">
//             <span>
//               <IconButton disabled>
//                 <DeleteOutlineIcon />
//               </IconButton>
//             </span>
//           </Tooltip>
//           <Box sx={{ flexGrow: 1 }} />
//           <Button variant="outlined" onClick={() => setOpenStock(false)}>
//             CANCEL
//           </Button>
//           <Button
//             variant="contained"
//             onClick={handleStockSave}
//             disabled={!stockForm.ingId || !stockForm.qty}
//           >
//             SAVE
//           </Button>
//         </DialogActions>
//       </Dialog>
//     </Box>
//   );
// }