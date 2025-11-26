// Frontend/src/services/Users/users.jsx

// VITE_API_BASE = "https://quscinabackoffice-production.up.railway.app/api"
const API_BASE = (import.meta.env?.VITE_API_BASE || "").replace(/\/+$/, "");

// Always pass paths WITHOUT /api prefix here, e.g. join("/users")
const join = (p = "") =>
  `${API_BASE}/${String(p).replace(/^\/+/, "")}`;

async function safeJson(res) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { error: text || res.statusText || "Invalid response" };
  }
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
      const res = await fetch(join("/users"), { credentials: "include" });
      const data = await safeJson(res);
      if (res.ok && active && Array.isArray(data)) {
        cb({ rows: data });
      } else if (!res.ok) {
        const msg = data?.error || res.statusText || "GET /users failed";
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
  const res = await fetch(join("/users"), { credentials: "include" });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(data.error || "List users failed");
  return data; // array
}

/**
 * Create user
 * Backend: POST /api/users
 */
export async function createUser(payload) {
  const res = await fetch(join("/users"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(data.error || "Create user failed");
  return data;
}

/**
 * Update user
 * Backend: PATCH /api/users/:employeeId
 */
export async function updateUser(employeeId, patch) {
  const res = await fetch(join(`/users/${encodeURIComponent(employeeId)}`), {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
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
  const res = await fetch(join(`/users/${encodeURIComponent(employeeId)}`), {
    method: "DELETE",
    credentials: "include",
    headers: { Accept: "application/json" },
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
  const res = await fetch(
    join(`/users/${encodeURIComponent(employeeId)}/unlock`),
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app, scope }), // app: 'backoffice' | 'pos' | 'kiosk' | ... ; scope: 'all'
    }
  );
  const data = await safeJson(res);
  if (!res.ok) throw new Error(data.error || "Unlock user failed");
  return data; // { ok: true }
}