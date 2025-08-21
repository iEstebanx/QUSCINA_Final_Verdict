// Frontend/src/services/Discounts/discounts.jsx
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "@/utils/firebaseConfig";

// safer JSON parse for API responses
async function safeJson(res) {
  const text = await res.text();
  try { return text ? JSON.parse(text) : {}; }
  catch { return { error: text || res.statusText || "Invalid response" }; }
}

const colRef = collection(db, "discounts");

// 🔁 Live reads from Firestore (no metadata, no offline flags)
export function subscribeDiscounts(cb) {
  const q = query(colRef, orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => {
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    cb({ rows });
  });
}

// Writes go through your API (no queuing/optimism)
export async function createDiscountAuto(payload) {
  const res = await fetch("/api/discounts", {
    method: "POST",
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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(data.error || "Update failed");
  return data;
}

export async function deleteDiscount(code) {
  const res = await fetch(`/api/discounts/${encodeURIComponent(code)}`, { method: "DELETE" });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(data.error || "Delete failed");
  return data;
}

export async function deleteMany(codes = []) {
  const res = await fetch(`/api/discounts/bulkDelete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ codes }),
  });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(data.error || "Bulk delete failed");
  return data;
}