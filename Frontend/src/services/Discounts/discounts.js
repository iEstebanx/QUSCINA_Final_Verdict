// Frontend/src/services/Discounts/discounts.jsx
// (kept Firestore imports in case you want to switch back later)
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "@/utils/firebaseConfig";

// safer JSON parse for API responses
async function safeJson(res) {
  const text = await res.text();
  try { return text ? JSON.parse(text) : {}; }
  catch { return { error: text || res.statusText || "Invalid response" }; }
}

const colRef = collection(db, "discounts");

/**
 * Live reads via backend polling (works with cookie sessions).
 * Calls cb({ rows }) like your page expects.
 */
export function subscribeDiscounts(cb, { intervalMs = 5000, onError } = {}) {
  let stopped = false;
  let timer = null;

  async function tick() {
    try {
      const res = await fetch("/api/discounts", {
        method: "GET",
        credentials: "include",              // <-- important
        headers: { Accept: "application/json" },
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const rows = (Array.isArray(data) ? data : []).map(d => ({
        id: d.id || d.code,  // normalize id for table/selection
        ...d,
      }));
      cb({ rows });
    } catch (e) {
      console.error("[subscribeDiscounts] failed:", e);
      onError?.(e.message || "Failed to fetch discounts");
    } finally {
      if (!stopped) timer = setTimeout(tick, intervalMs);
    }
  }

  tick();
  return () => { stopped = true; if (timer) clearTimeout(timer); };
}

// If you ever want true Firestore realtime & your rules allow it, you can switch back:
// export function subscribeDiscounts(cb, { onError } = {}) {
//   const q = query(colRef, orderBy("createdAt", "desc"));
//   return onSnapshot(q,
//     snap => cb({ rows: snap.docs.map(d => ({ id: d.id, ...d.data() })) }),
//     err  => onError?.(err.message || "Firestore read failed")
//   );
// }

// Writes go through your API (with cookies)
export async function createDiscountAuto(payload) {
  const res = await fetch("/api/discounts", {
    method: "POST",
    credentials: "include",                 // <-- added
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: payload.name,
      value: Number(payload.value),
      type: payload.type ?? "percent",
      scope: payload.scope ?? "order",
      isStackable: !!payload.isStackable,
      requiresApproval: !!payload.requiresApproval,
      isActive: payload.isActive !== false,
    }),
  });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(data.error || "Create failed");
  return data; // { ok: true, code }
}

export async function updateDiscount(code, patch) {
  const res = await fetch(`/api/discounts/${encodeURIComponent(code)}`, {
    method: "PATCH",
    credentials: "include",                 // <-- added
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(data.error || "Update failed");
  return data;
}

export async function deleteDiscount(code) {
  const res = await fetch(`/api/discounts/${encodeURIComponent(code)}`, {
    method: "DELETE",
    credentials: "include",                 // <-- added
  });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(data.error || "Delete failed");
  return data;
}

export async function deleteMany(codes = []) {
  const res = await fetch(`/api/discounts/bulkDelete`, {
    method: "POST",
    credentials: "include",                 // <-- added
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ codes }),
  });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(data.error || "Bulk delete failed");
  return data;
}