// src/theme.js
import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  breakpoints: {
    values: {
      xs: 0,      // Mobile
      sm: 576,    // Tablets start at 576
      md: 768,    // Desktop
      lg: 992,    // Larger desktop
      xl: 1200,   // Extra large
    },
  },
});

export default theme;