// Frontend/src/context/ConfirmContext.jsx
import { createContext, useCallback, useContext, useRef, useState, useMemo } from "react";
import PropTypes from "prop-types";
import {
  Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions,
  Button, Stack
} from "@mui/material";

const ConfirmCtx = createContext(null);

/**
 * useConfirm() -> (options) => Promise<boolean>
 * Usage:
 *   const confirm = useConfirm();
 *   const ok = await confirm({ title: "Delete", content: "Are you sure?" });
 *   if (ok) { ...do it... }
 */
export function useConfirm() {
  const ctx = useContext(ConfirmCtx);
  if (!ctx) throw new Error("useConfirm must be used within <ConfirmProvider>");
  return ctx.confirm;
}

export function ConfirmProvider({ children }) {
  const resolveRef = useRef(null);
  const pendingResultRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState({
    title: "Are you sure?",
    content: "",
    confirmLabel: "Confirm",
    cancelLabel: "Cancel",
    confirmColor: "primary", // "primary" | "error" | "inherit" | "secondary" | "success" | "warning" | "info"
    maxWidth: "xs",
  });

  const confirm = useCallback((options = {}) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setOpts((prev) => ({ ...prev, ...options }));
      setOpen(true);
    });
  }, []);

  const ctxValue = useMemo(() => ({ confirm }), [confirm]);

  // Ensure no focused element remains inside the dialog as it unmounts
  const blurActive = () => {
    const el = document.activeElement;
    if (el && typeof el.blur === "function") el.blur();
  };

  // Close now, resolve later (after transition), to avoid overlap with parent closing
  const closeWithResult = (result) => {
    pendingResultRef.current = result;
    blurActive();
    setOpen(false);
  };

  const handleClose   = () => closeWithResult(false);   // ESC/backdrop -> cancel
  const handleCancel  = () => closeWithResult(false);
  const handleConfirm = () => closeWithResult(true);

  return (
    <ConfirmCtx.Provider value={ctxValue}>
      {children}

      <Dialog
        open={open}
        onClose={handleClose}
        fullWidth
        maxWidth={opts.maxWidth}
        // Keep Chrome from restoring focus to something that may be hidden next
        disableAutoFocus
        disableRestoreFocus
        // When the dialog is fully gone, THEN resolve the promise
        TransitionProps={{
          onExited: () => {
            blurActive();
            const r = pendingResultRef.current;
            pendingResultRef.current = null;
            if (resolveRef.current) {
              const resolve = resolveRef.current;
              resolveRef.current = null;
              resolve(Boolean(r));
            }
          },
        }}
      >
        {opts.title ? <DialogTitle>{opts.title}</DialogTitle> : null}

        {(opts.content || opts.renderContent) && (
          <DialogContent>
            {opts.renderContent ? (
              opts.renderContent
            ) : (
              <DialogContentText sx={{ whiteSpace: "pre-wrap" }}>
                {opts.content}
              </DialogContentText>
            )}
          </DialogContent>
        )}

        <DialogActions sx={{ p: 1.5 }}>
          <Stack direction="row" spacing={1}>
            <Button onClick={handleCancel} variant="outlined" size="small">
              {opts.cancelLabel || "Cancel"}
            </Button>
            <Button
              onClick={handleConfirm}
              variant="contained"
              size="small"
              color={opts.confirmColor || "primary"}
              autoFocus
            >
              {opts.confirmLabel || "Confirm"}
            </Button>
          </Stack>
        </DialogActions>
      </Dialog>
    </ConfirmCtx.Provider>
  );
}

ConfirmProvider.propTypes = {
  children: PropTypes.node.isRequired,
};