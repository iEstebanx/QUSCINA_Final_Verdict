// src/theme.js
import { createTheme, responsiveFontSizes } from '@mui/material/styles';

let theme = createTheme({
  // Bootstrap-like breakpoints (optional)
  breakpoints: {
    values: {
      xs: 0,
      sm: 576,
      md: 768,
      lg: 992,
      xl: 1200,
    },
  },

  palette: {
    mode: 'light',
    primary: { main: '#1976d2' },   // MUI blue
    secondary: { main: '#9c27b0' }, // purple
    success: { main: '#2e7d32' },
    warning: { main: '#ed6c02' },
    error: { main: '#d32f2f' },
    info: { main: '#0288d1' },
    background: {
      default: '#f7f9fc',
      paper: '#ffffff',
    },
    text: {
      primary: '#1f2937',  // slate-800
      secondary: '#475569', // slate-600
    },
    divider: 'rgba(0,0,0,0.08)',
  },

  typography: {
    fontFamily: [
      'Inter',
      'ui-sans-serif',
      'system-ui',
      '-apple-system',
      'Segoe UI',
      'Roboto',
      'Helvetica Neue',
      'Arial',
      'Noto Sans',
      'Apple Color Emoji',
      'Segoe UI Emoji',
    ].join(','),
    h1: { fontWeight: 700, letterSpacing: -0.5 },
    h2: { fontWeight: 700, letterSpacing: -0.5 },
    h3: { fontWeight: 700 },
    h4: { fontWeight: 700 },
    h5: { fontWeight: 600 },
    h6: { fontWeight: 600 },
    button: { textTransform: 'none', fontWeight: 600 },
    subtitle1: { color: '#475569' },
    body2: { color: '#4b5563' },
  },

  shape: {
    borderRadius: 12,
  },

  shadows: [
    'none',
    '0 1px 2px rgba(0,0,0,0.06)',
    '0 2px 8px rgba(0,0,0,0.06)',
    '0 4px 12px rgba(0,0,0,0.08)',
    ...Array(21).fill('0 8px 20px rgba(0,0,0,0.08)'),
  ],

  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { backgroundColor: '#f7f9fc' },
        '*::-webkit-scrollbar': { width: 8, height: 8 },
        '*::-webkit-scrollbar-thumb': {
          background: 'rgba(0,0,0,0.2)',
          borderRadius: 8,
        },
      },
    },

    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 12, paddingInline: 16, height: 40 },
        containedPrimary: { boxShadow: '0 4px 12px rgba(25,118,210,0.25)' },
      },
    },

    MuiAppBar: {
      styleOverrides: {
        root: { background: '#ffffff', color: '#1f2937', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' },
      },
    },

    MuiPaper: {
      styleOverrides: {
        root: { borderRadius: 16 },
      },
    },

    MuiTextField: {
      defaultProps: { size: 'small' },
    },

    MuiCard: {
      styleOverrides: {
        root: { borderRadius: 16, boxShadow: '0 4px 16px rgba(0,0,0,0.06)' },
      },
    },

    // Nice defaults for DataGrid
    MuiDataGrid: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          border: '1px solid rgba(0,0,0,0.06)',
          backgroundColor: '#fff',
        },
        columnHeaders: {
          backgroundColor: '#f1f5f9',
          borderBottom: '1px solid rgba(0,0,0,0.06)',
        },
      },
    },
  },
});

theme = responsiveFontSizes(theme, { factor: 2.8 }); // scale typography across breakpoints

export default theme;