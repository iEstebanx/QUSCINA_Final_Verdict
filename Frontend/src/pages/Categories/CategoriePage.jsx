// Frontend/src/pages/Categories/CategoriePage.jsx
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
  TablePagination,
  TableRow,
  TextField,
  Typography,
  RadioGroup,
  FormControlLabel,
  Radio,
  Avatar,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { alpha } from "@mui/material/styles";

function newId() {
  return `cat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function blurActive() {
  const el = document.activeElement;
  if (el && typeof el.blur === "function") el.blur();
}

export default function CategoriePage() {
  // Mock data (so we can test the dialog)
  const [rows, setRows] = useState([
    {
      id: newId(),
      name: "Beverages",
      mode: "color", // 'color' | 'picture'
      color: "#FF6F00",
      imageUrl: null,
    },
  ]);

  // Selection
  const [selected, setSelected] = useState([]);
  const allChecked = rows.length > 0 && rows.every((r) => selected.includes(r.id));
  const someChecked = rows.some((r) => selected.includes(r.id)) && !allChecked;

  const toggleAll = () => {
    setSelected((s) => (s.length === rows.length ? [] : rows.map((r) => r.id)));
  };
  const toggleOne = (id) => {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  // Dialog (create/edit)
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null); // null=create, string=edit

  const isEdit = Boolean(editingId);

  const [mode, setMode] = useState("color"); // 'color' | 'picture'
  const [name, setName] = useState("");
  const [color, setColor] = useState("#6C5CE7");
  const [imageUrl, setImageUrl] = useState(null);
  const [touched, setTouched] = useState(false);

  const resetForm = () => {
    setMode("color");
    setName("");
    setColor("#6C5CE7");
    setImageUrl(null);
    setTouched(false);
    setEditingId(null);
  };

  const openCreate = () => {
    blurActive();
    resetForm();
    setOpen(true);
  };

  const openEdit = (row) => {
    blurActive();
    setEditingId(row.id);
    setMode(row.mode || "color");
    setName(row.name || "");
    setColor(row.color || "#6C5CE7");
    setImageUrl(row.imageUrl || null);
    setTouched(false);
    setOpen(true);
  };

  const onPickImage = (file) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setImageUrl(url);
  };

  const onSave = () => {
    setTouched(true);
    const valid = name.trim().length > 0 && (mode === "color" ? !!color : !!imageUrl);
    if (!valid) return;

    if (isEdit) {
      setRows((prev) =>
        prev.map((r) =>
          r.id === editingId ? { ...r, name: name.trim(), mode, color: mode === "color" ? color : null, imageUrl: mode === "picture" ? imageUrl : null } : r
        )
      );
    } else {
      setRows((prev) => [
        ...prev,
        {
          id: newId(),
          name: name.trim(),
          mode,
          color: mode === "color" ? color : null,
          imageUrl: mode === "picture" ? imageUrl : null,
        },
      ]);
    }
    setOpen(false);
    resetForm();
  };

  // Pagination
  const [pageState, setPageState] = useState({ page: 0, rowsPerPage: 10 });
  const { page, rowsPerPage } = pageState;

  const paged = useMemo(() => {
    const start = page * rowsPerPage;
    return rows.slice(start, start + rowsPerPage);
  }, [rows, page, rowsPerPage]);

  const nameError = touched && name.trim().length === 0;
  const visualError =
    touched && ((mode === "color" && !color) || (mode === "picture" && !imageUrl));

  return (
    <Box p={2} display="grid" gap={2}>
      <Paper sx={{ overflow: "hidden" }}>
        {/* Header (ItemList-style) */}
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
              onClick={(e) => { e.currentTarget.blur(); openCreate(); }}
              sx={{ flexShrink: 0 }}
            >
              Add Category
            </Button>

            <Box sx={{ flexGrow: 1, minWidth: 0 }} />
            {/* (Optional extra controls can go here later) */}
          </Stack>
        </Box>

        <Divider />

        {/* Table (sticky header, horizontal scroll only here) */}
        <Box p={2} sx={{ minWidth: 0 }}>
          <TableContainer
            component={Paper}
            elevation={0}
            className="scroll-x"
            sx={{ width: "100%", borderRadius: 1, maxHeight: 520, overflowX: "auto" }}
          >
            <Table
              stickyHeader
              aria-label="categories table"
              sx={{ tableLayout: "fixed", minWidth: { xs: 560, sm: 720, md: 800 } }}
            >
              {/* 56px checkbox, 140px color/picture, rest for name */}
              <colgroup>
                <col style={{ width: 56 }} />
                <col style={{ width: 140 }} />
                <col />
              </colgroup>

              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">
                    <Checkbox checked={allChecked} indeterminate={someChecked} onChange={toggleAll} />
                  </TableCell>
                  <TableCell>
                    <Typography fontWeight={600}>Color / Picture</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography fontWeight={600}>Name</Typography>
                  </TableCell>
                </TableRow>
              </TableHead>

              <TableBody>
                {paged.map((r) => (
                  <TableRow
                    key={r.id}
                    hover
                    onClick={() => openEdit(r)}
                    sx={(theme) => ({
                      cursor: "pointer",
                      "&:hover": { backgroundColor: alpha(theme.palette.primary.main, 0.04) },
                    })}
                  >
                    <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selected.includes(r.id)}
                        onChange={() => toggleOne(r.id)}
                      />
                    </TableCell>

                    {/* Color / Picture */}
                    <TableCell>
                      {r.mode === "picture" && r.imageUrl ? (
                        <Avatar
                          src={r.imageUrl}
                          alt={r.name}
                          sx={{ width: 36, height: 36, borderRadius: 1 }}
                        />
                      ) : (
                        <Box
                          sx={{
                            width: 36,
                            height: 36,
                            borderRadius: 1,
                            bgcolor: r.color || "#ccc",
                            border: "1px solid",
                            borderColor: "divider",
                          }}
                          aria-label={`Color ${r.color || ""}`}
                        />
                      )}
                    </TableCell>

                    {/* Name */}
                    <TableCell sx={{ overflow: "hidden" }}>
                      <Typography noWrap title={r.name}>
                        {r.name}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}

                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3}>
                      <Box py={6} textAlign="center">
                        <Typography variant="body2" color="text.secondary">
                          No categories yet. Click <strong>Add Category</strong> to create one.
                        </Typography>
                      </Box>
                    </TableCell>
                  </TableRow>
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

      {/* Create / Edit Dialog */}
      <Dialog
        open={open}
        onClose={() => {
          setOpen(false);
          resetForm();
        }}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>
          <Stack alignItems="center" spacing={1}>
            <Typography variant="h5" fontWeight={800}>
              {isEdit ? "Edit Category" : "Add Category"}
            </Typography>
            {isEdit && (
              <Typography variant="body2" color="text.secondary">
                ID: {editingId}
              </Typography>
            )}
          </Stack>
        </DialogTitle>

        <Divider />

        <DialogContent>
          <Stack spacing={2} mt={1}>
            <TextField
              label="Category Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              error={nameError}
              helperText={nameError ? "Please enter a name." : " "}
              autoFocus
              fullWidth
              onKeyDown={(e) => e.key === "Enter" && onSave()}
            />

            {/* Choose Color or Picture */}
            <RadioGroup
              row
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              aria-label="category-visual-mode"
            >
              <FormControlLabel value="color" control={<Radio />} label="Color" />
              <FormControlLabel value="picture" control={<Radio />} label="Picture" />
            </RadioGroup>

            {mode === "color" ? (
              <Stack direction="row" alignItems="center" spacing={2}>
                <TextField
                  label="Color"
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  error={visualError}
                  helperText={visualError ? "Pick a color." : " "}
                  sx={{ width: 120 }}
                  inputProps={{ "aria-label": "Category color" }}
                />
                <Box
                  sx={{
                    width: 36,
                    height: 36,
                    borderRadius: 1,
                    bgcolor: color,
                    border: "1px solid",
                    borderColor: "divider",
                  }}
                />
              </Stack>
            ) : (
              <Stack spacing={1.5}>
                <Button
                  variant="outlined"
                  component="label"
                  sx={{ alignSelf: "start" }}
                >
                  Upload Picture
                  <input
                    type="file"
                    hidden
                    accept="image/*"
                    onChange={(e) => onPickImage(e.target.files?.[0])}
                  />
                </Button>
                {imageUrl && (
                  <Avatar
                    src={imageUrl}
                    alt="Preview"
                    sx={{ width: 72, height: 72, borderRadius: 1 }}
                  />
                )}
                {visualError && (
                  <Typography variant="caption" color="error">
                    Please upload an image.
                  </Typography>
                )}
              </Stack>
            )}
          </Stack>
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            variant="outlined"
            onClick={() => {
              setOpen(false);
              resetForm();
            }}
          >
            Cancel
          </Button>
          <Button variant="contained" onClick={onSave} disabled={name.trim().length === 0}>
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}