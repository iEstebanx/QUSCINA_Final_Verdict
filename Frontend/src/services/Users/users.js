// Frontend/src/services/Users/users.jsx
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "@/utils/firebaseConfig";

async function safeJson(res) {
  const text = await res.text();
  try { return text ? JSON.parse(text) : {}; }
  catch { return { error: text || res.statusText || "Invalid response" }; }
}

// Live reads direct from Firestore (like discounts)
const colRef = collection(db, "employees");

export function subscribeUsers(cb) {
  const q = query(colRef, orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => {
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    cb({ rows });
  });
}

export async function createUser(payload) {
  const res = await fetch("/api/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(data.error || "Create user failed");
  return data;
}

export async function updateUser(employeeId, patch) {
  const res = await fetch(`/api/users/${encodeURIComponent(employeeId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(data.error || "Update user failed");
  return data;
}

export async function deleteUser(employeeId) {
  const res = await fetch(`/api/users/${encodeURIComponent(employeeId)}`, { method: "DELETE" });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(data.error || "Delete user failed");
  return data;
}