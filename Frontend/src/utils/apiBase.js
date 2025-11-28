// Frontend/src/utils/apiBase.js
const RAILWAY_API_ORIGIN =
  "https://quscinabackofficebackend-production.up.railway.app"; // ← make sure this matches Railway

function computeApiBase() {
  if (typeof window === "undefined") return "";

  const host = window.location.hostname;
  const isLocal =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.endsWith(".devtunnels.ms") ||
    host.startsWith("192.168.") ||
    host.startsWith("10.");

  // Local dev → use Vite proxy (/api → localhost:5000)
  if (isLocal) return "";

  // Deployed frontend (Vercel) → call Railway directly
  return RAILWAY_API_ORIGIN;
}

export const API_BASE = computeApiBase();

export function joinApi(p = "") {
  return (
    `${API_BASE}`.replace(/\/+$/, "") +
    `/${String(p).replace(/^\/+/, "")}`
  );
}