import { createContext, useContext } from "react";
import { SnackbarProvider, useSnackbar } from "notistack";

const AlertCtx = createContext(null);
export const useAlert = () => useContext(AlertCtx);

function AlertsInner({ children }) {
  const { enqueueSnackbar } = useSnackbar();
  const api = {
    success: (m) => enqueueSnackbar(m, { variant: "success" }),
    error:   (m) => enqueueSnackbar(m, { variant: "error" }),
    info:    (m) => enqueueSnackbar(m, { variant: "info" }),
    warn:    (m) => enqueueSnackbar(m, { variant: "warning" })
  };
  return <AlertCtx.Provider value={api}>{children}</AlertCtx.Provider>;
}

export function AlertProvider({ children }) {
  return (
    <SnackbarProvider maxSnack={3} autoHideDuration={3000}>
      <AlertsInner>{children}</AlertsInner>
    </SnackbarProvider>
  );
}