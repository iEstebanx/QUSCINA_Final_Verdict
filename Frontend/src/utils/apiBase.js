// Frontend/src/utils/apiBase.js
const RAILWAY_API_ORIGIN =
  "https://quscinabackoffice-production.up.railway.app";

function computeApiBase() {
  if (typeof window === "undefined") return "";

  const host = window.location.hostname;
  const isLocal =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.startsWith("192.168.") ||
    host.startsWith("10.");

  if (isLocal) return "";           // dev → Vite proxy
  return RAILWAY_API_ORIGIN;        // Vercel → Railway
}

export const API_BASE = computeApiBase();

export function joinApi(p = "") {
  return (
    `${API_BASE}`.replace(/\/+$/, "") +
    `/${String(p).replace(/^\/+/, "")}`
  );
}