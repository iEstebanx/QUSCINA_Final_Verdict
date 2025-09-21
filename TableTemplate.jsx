// TABLE TEMPLATE // TABLE TEMPLATE // TABLE TEMPLATE // TABLE TEMPLATE // TABLE TEMPLATE 
// TABLE TEMPLATE // TABLE TEMPLATE // TABLE TEMPLATE // TABLE TEMPLATE // TABLE TEMPLATE

// Frontend/src/pages/Categories/CategoriePage.jsx
import { useMemo, useState, useEffect } from "react";
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
      imageUrl: null, // use image only
    },
  ]);

  // Keep track of Object URLs to revoke on unmount/update
  const [objectUrls, setObjectUrls] = useState([]);
  useEffect(() => {
    return () => {
      objectUrls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [objectUrls]);

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

  const [name, setName] = useState("");
  const [imageUrl, setImageUrl] = useState(null);
  const [touched, setTouched] = useState(false);

  const resetForm = () => {
    setName("");
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
    setName(row.name || "");
    setImageUrl(row.imageUrl || null);
    setTouched(false);
    setOpen(true);
  };

  const onPickImage = (file) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setObjectUrls((prev) => [...prev, url]);
    setImageUrl(url);
  };

  const onRemoveImage = () => {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageUrl(null);
  };

  const onSave = () => {
    setTouched(true);
    const valid = name.trim().length > 0 && !!imageUrl;
    if (!valid) return;

    if (isEdit) {
      setRows((prev) =>
        prev.map((r) => (r.id === editingId ? { ...r, name: name.trim(), imageUrl } : r))
      );
    } else {
      setRows((prev) => [
        ...prev,
        {
          id: newId(),
          name: name.trim(),
          imageUrl,
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
  const imageError = touched && !imageUrl;

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
              onClick={(e) => {
                e.currentTarget.blur();
                openCreate();
              }}
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
            sx={{
              mx: "auto",
              // full-width on phones, shrink/cap on larger screens
              width: { xs: "100%", sm: "auto" },
              maxWidth: 720,            // <-- pick your cap (e.g., 640, 720, 900)
            }}
          >
            <Table
              stickyHeader
              aria-label="categories table"
              sx={{ tableLayout: "fixed", minWidth: 520 }} // 56 + 120 + ~240 + padding
            >
              <colgroup>
                <col style={{ width: 56 }} />             {/* checkbox */}
                <col style={{ width: 120 }} />            {/* image */}
                <col style={{ minWidth: 240 }} />         {/* name */}
              </colgroup>
              
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">
                    <Checkbox checked={allChecked} indeterminate={someChecked} onChange={toggleAll} />
                  </TableCell>
                  <TableCell>
                    <Typography fontWeight={600}>Image</Typography>
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
                      <Checkbox checked={selected.includes(r.id)} onChange={() => toggleOne(r.id)} />
                    </TableCell>

                    {/* Image */}
                    <TableCell>
                      {r.imageUrl ? (
                        <Avatar
                          src={r.imageUrl}
                          alt={r.name}
                          sx={{ width: 56, height: 56, borderRadius: 1 }}
                          variant="rounded"
                        />
                      ) : (
                        <Avatar
                          variant="rounded"
                          sx={{ width: 56, height: 56, borderRadius: 1 }}
                        >
                          {r.name?.[0]?.toUpperCase() || "?"}
                        </Avatar>
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

            {/* Image picker (required) */}
            <Stack spacing={1.5}>
              <Stack direction="row" spacing={1}>
                <Button variant="outlined" component="label" sx={{ alignSelf: "start" }}>
                  Upload Image
                  <input
                    type="file"
                    hidden
                    accept="image/*"
                    onChange={(e) => onPickImage(e.target.files?.[0])}
                  />
                </Button>
                {imageUrl && (
                  <Button variant="text" color="error" onClick={onRemoveImage}>
                    Remove
                  </Button>
                )}
              </Stack>

              {imageUrl && (
                <Avatar src={imageUrl} alt="Preview" sx={{ width: 96, height: 96 }} variant="rounded" />
              )}

              {imageError && (
                <Typography variant="caption" color="error">
                  Please upload an image.
                </Typography>
              )}
            </Stack>
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