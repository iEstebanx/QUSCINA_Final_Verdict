// src/main.jsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import ThemeModeProvider from "./theme/ThemeModeProvider.jsx";

import { initFirestoreNetworkAutoToggle } from "@/utils/firestoreNetwork";
initFirestoreNetworkAutoToggle();

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ThemeModeProvider>
      <App />
    </ThemeModeProvider>
  </StrictMode>
);
