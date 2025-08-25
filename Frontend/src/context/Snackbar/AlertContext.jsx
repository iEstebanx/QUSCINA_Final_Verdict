// Frontend/src/context/Snackbar/AlertContext.jsx
import { createContext, useContext, useMemo } from "react";
import PropTypes from "prop-types";
import { SnackbarProvider, useSnackbar } from "notistack";

const AlertCtx = createContext(null);
export const useAlert = () => useContext(AlertCtx);

function AlertsInner({ children }) {
  const { enqueueSnackbar } = useSnackbar();

  // Stable context value across renders
  const api = useMemo(
    () => ({
      success: (m) => enqueueSnackbar(m, { variant: "success" }),
      error:   (m) => enqueueSnackbar(m, { variant: "error" }),
      info:    (m) => enqueueSnackbar(m, { variant: "info" }),
      warn:    (m) => enqueueSnackbar(m, { variant: "warning" }),
    }),
    [enqueueSnackbar]
  );

  return <AlertCtx.Provider value={api}>{children}</AlertCtx.Provider>;
}

AlertsInner.propTypes = {
  children: PropTypes.node.isRequired,
};

export function AlertProvider({ children }) {
  return (
    <SnackbarProvider maxSnack={3} autoHideDuration={3000}>
      <AlertsInner>{children}</AlertsInner>
    </SnackbarProvider>
  );
}

AlertProvider.propTypes = {
  children: PropTypes.node.isRequired,
};