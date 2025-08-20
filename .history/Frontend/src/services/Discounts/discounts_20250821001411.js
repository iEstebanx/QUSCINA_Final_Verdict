// Frontend/src/services/Discounts/discounts.jsx
import {
  collection, onSnapshot, query, orderBy
} from "firebase/firestore";
import { db } from "@/utils/firebaseConfig";

const colRef = collection(db, "discounts");

export function subscribeDiscounts(cb, includeMetadata = true) {
  const q = query(colRef, orderBy("createdAt", "desc"));
  return onSnapshot(q, { includeMetadataChanges: includeMetadata }, (snap) => {
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    cb({
      rows,
      fromCache: snap.metadata.fromCache,
      hasPendingWrites: snap.metadata.hasPendingWrites,
    });
  });
}

// WRITES: go through your API

export async function createDiscountAuto({
  name, value, type = "percent", scope = "order",
  isStackable = false, requiresApproval = false, isActive = true,
}) {
  const res = await fetch("/api/discounts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name, value: Number(value), type, scope, isStackable, requiresApproval, isActive
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Create failed");
  return data; // { ok: true, code }
}

export async function updateDiscount(code, patch) {
  const res = await fetch(`/api/discounts/${encodeURIComponent(code)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Update failed");
  return data;
}

export async function deleteDiscount(code) {
  const res = await fetch(`/api/discounts/${encodeURIComponent(code)}`, { method: "DELETE" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Delete failed");
  return data;
}

export async function deleteMany(codes = []) {
  const res = await fetch(`/api/discounts/:bulkDelete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ codes }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Bulk delete failed");
  return data;
}
