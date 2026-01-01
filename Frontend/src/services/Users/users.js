// QUSCINA_BACKOFFICE/Frontend/src/services/Users/users.js
import { joinApi } from "@/utils/apiBase";

async function safeJson(res) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { error: text || res.statusText || "Invalid response" };
  }
}

function isFormData(v) {
  return typeof FormData !== "undefined" && v instanceof FormData;
}

// Helper to build /api/users/... URLs via joinApi
const usersUrl = (suffix = "") =>
  joinApi(
    `/api/users${
      suffix ? `/${String(suffix).replace(/^\/+/, "")}` : ""
    }`
  );


function getStoredToken() {
  return (
    sessionStorage.getItem("qd_token") ||
    localStorage.getItem("qd_token") ||
    ""
  );
}

function authedHeaders(extra = {}) {
  const token = getStoredToken();
  return {
    "X-App": "backoffice",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

/**
 * Subscribe to the users list by polling the backend.
 * Backend route: GET /api/users
 */
export function subscribeUsers(cb, { intervalMs = 5000, onError } = {}) {
  let active = true;
  let timer = null;

  async function tick() {
    try {
      const res = await fetch(usersUrl(), {
        credentials: "include",
        headers: authedHeaders(),
        cache: "no-store",
      });
      const data = await safeJson(res);
      if (res.ok && active && Array.isArray(data)) {
        cb({ rows: data });
      } else if (!res.ok) {
        const msg = data?.error || res.statusText || "GET /api/users failed";
        console.error(msg);
        onError?.(msg);
      }
    } catch (e) {
      console.error("users poll failed", e);
      onError?.(e?.message || "Users poll failed");
    } finally {
      if (active) timer = setTimeout(tick, intervalMs);
    }
  }

  tick();
  return () => {
    active = false;
    if (timer) clearTimeout(timer);
  };
}

/**
 * One-shot fetch of all users
 * Backend: GET /api/users
 */
export async function fetchUsersOnce() {
  const res = await fetch(usersUrl(), {
    credentials: "include",
    headers: authedHeaders(),
    cache: "no-store",
  });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(data.error || "List users failed");
  return data; // array
}

/**
 * Create user
 * Backend: POST /api/users
 */
export async function createUser(payload, opts = {}) {
  const multipart = opts?.multipart || isFormData(payload);

  const res = await fetch(usersUrl(), {
    method: "POST",
    credentials: "include",
    headers: multipart
      ? authedHeaders()
      : authedHeaders({ "Content-Type": "application/json" }),
    body: multipart ? payload : JSON.stringify(payload),
  });

  const data = await safeJson(res);
  if (!res.ok) throw new Error(data.error || "Create user failed");
  return data;
}

/**
 * Update user
 * Backend: PATCH /api/users/:employeeId
 */
export async function updateUser(employeeId, patch, opts = {}) {
  const multipart = opts?.multipart || isFormData(patch);

  const res = await fetch(usersUrl(encodeURIComponent(employeeId)), {
    method: "PATCH",
    credentials: "include",
    headers: multipart
      ? authedHeaders()
      : authedHeaders({ "Content-Type": "application/json" }),
    body: multipart ? patch : JSON.stringify(patch),
  });

  const data = await safeJson(res);
  if (!res.ok) throw new Error(data.error || "Update user failed");
  return data;
}

/**
 * Delete user
 * Backend: DELETE /api/users/:employeeId
 */
export async function deleteUser(employeeId, { signal } = {}) {
  if (!employeeId) throw new Error("employeeId is required");
  const res = await fetch(usersUrl(encodeURIComponent(employeeId)), {
    method: "DELETE",
    credentials: "include",
    headers: authedHeaders({ Accept: "application/json" }),
    signal,
  });
  if (res.ok || res.status === 404) return { ok: true };
  const data = await safeJson(res);
  throw new Error(data.error || "Delete user failed");
}

/**
 * 🔓 Unlock a user account
 * Backend: POST /api/users/:employeeId/unlock
 */
export async function unlockUser(employeeId, { app, scope } = {}) {
  if (!employeeId) throw new Error("employeeId is required");
  const res = await fetch(usersUrl(`${encodeURIComponent(employeeId)}/unlock`), {
    method: "POST",
    credentials: "include",
    headers: authedHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ app, scope }),
  });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(data.error || "Unlock user failed");
  return data; // { ok: true }
}

/**
 * 🎟️ Create a one-time POS PIN reset ticket for a cashier
 * Backend: POST /api/users/:employeeId/pin-reset-ticket
 * Returns: { token, expiresAt, requestId } (shape depends on backend)
 */
export async function createPinResetTicket(employeeId) {
  if (!employeeId) throw new Error("employeeId is required");

  const res = await fetch(usersUrl(`${encodeURIComponent(employeeId)}/pin-reset-ticket`), {
    method: "POST",
    credentials: "include",
    headers: authedHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({}),
  });

  const data = await safeJson(res);
  if (!res.ok) throw new Error(data.error || "Create reset ticket failed");
  return data;
}

/**
 * 🚫 Optional: revoke a ticket (only if your backend supports it)
 * Backend: POST /api/users/:employeeId/pin-reset-ticket/revoke
 */
export async function revokePinResetTicket(employeeId, requestId) {
  if (!employeeId) throw new Error("employeeId is required");

  const res = await fetch(usersUrl(`${encodeURIComponent(employeeId)}/pin-reset-ticket/revoke`), {
    method: "POST",
    credentials: "include",
    headers: authedHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ requestId }),
  });

  const data = await safeJson(res);
  if (!res.ok) throw new Error(data.error || "Revoke reset ticket failed");
  return data; // { ok: true }
}

export async function getActivePinResetTicket(employeeId) {
  if (!employeeId) throw new Error("employeeId is required");

  const res = await fetch(usersUrl(`${encodeURIComponent(employeeId)}/pin-reset-ticket/active`), {
    method: "GET",
    credentials: "include",
    headers: authedHeaders(),
    cache: "no-store",
  });
  
  const data = await safeJson(res);
  if (!res.ok) throw new Error(data.error || "Check active ticket failed");
  return data; // { ok, active, requestId, expiresAt, createdAt }
}