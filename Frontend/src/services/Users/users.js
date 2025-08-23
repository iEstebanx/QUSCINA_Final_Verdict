// Frontend/src/services/Users/users.jsx

// Note: This module intentionally avoids Firestore client reads.
// All data flows through the backend API (Backend/src/routes/Users/users.js).

const API_BASE = import.meta.env?.VITE_API_BASE || "";

async function safeJson(res) {
  const text = await res.text();
  try { return text ? JSON.parse(text) : {}; }
  catch { return { error: text || res.statusText || "Invalid response" }; }
}

/**
 * Subscribe to the users list by polling the backend.
 * Usage:
 *   const unsub = subscribeUsers(({ rows }) => setRows(rows), { intervalMs: 5000 });
 *   return () => unsub();
 */
export function subscribeUsers(cb, { intervalMs = 5000 } = {}) {
  let active = true;
  let timer = null;

  async function tick() {
    try {
      const res = await fetch(`${API_BASE}/api/users`, { credentials: "include" });
      const data = await safeJson(res);
      if (res.ok && active && Array.isArray(data)) {
        cb({ rows: data });
      } else if (!res.ok) {
        console.error("GET /api/users failed:", data?.error || res.statusText);
      }
    } catch (e) {
      console.error("users poll failed", e);
    } finally {
      if (active) timer = setTimeout(tick, intervalMs);
    }
  }

  // initial fetch immediately
  tick();

  // unsubscribe/cleanup
  return () => {
    active = false;
    if (timer) clearTimeout(timer);
  };
}

/** Optional one-shot fetch if you ever need it */
export async function fetchUsersOnce() {
  const res = await fetch(`${API_BASE}/api/users`, { credentials: "include" });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(data.error || "List users failed");
  return data; // array
}

export async function createUser(payload) {
  const res = await fetch(`${API_BASE}/api/users`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(data.error || "Create user failed");
  return data;
}

export async function updateUser(employeeId, patch) {
  const res = await fetch(`${API_BASE}/api/users/${encodeURIComponent(employeeId)}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(data.error || "Update user failed");
  return data;
}

export async function deleteUser(employeeId) {
  const res = await fetch(`${API_BASE}/api/users/${encodeURIComponent(employeeId)}`, {
    method: "DELETE",
    credentials: "include",
  });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(data.error || "Delete user failed");
  return data;
}