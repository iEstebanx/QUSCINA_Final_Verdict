// services/Discounts/discounts.js
import {
  collection, doc, setDoc, updateDoc, deleteDoc,
  onSnapshot, query, orderBy, serverTimestamp, writeBatch
} from "firebase/firestore";
import { db } from "@/utils/firebaseConfig";

const colRef = collection(db, "discounts");

export function subscribeDiscounts(cb, includeMetadata = true) {
  const q = query(colRef, orderBy("createdAt", "desc"));
  return onSnapshot(q, { includeMetadataChanges: includeMetadata }, (snap) => {
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const fromCache = snap.metadata.fromCache;
    const hasPendingWrites = snap.metadata.hasPendingWrites;
    cb({ rows, fromCache, hasPendingWrites });
  });
}

// ✅ Create (doc id = code) — offline-first, no preflight read
export async function createDiscount({
  code, name, type = "percent", value, scope = "order",
  isStackable = false, requiresApproval = false, isActive = true
}) {
  if (!code) throw new Error("Code is required");

  const ref = doc(colRef, code);
  await setDoc(ref, {
    code,
    name,
    type,
    value: Number(value),
    scope,
    isStackable,
    requiresApproval,
    isActive,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: false }); // resolves immediately even offline (queued)
}

// Update (partial)
export async function updateDiscount(code, patch) {
  const ref = doc(colRef, code);
  await updateDoc(ref, { ...patch, updatedAt: serverTimestamp() });
}

// Delete one
export async function deleteDiscount(code) {
  await deleteDoc(doc(colRef, code));
}

// Bulk delete
export async function deleteMany(codes = []) {
  const batch = writeBatch(db);
  codes.forEach((c) => batch.delete(doc(colRef, c)));
  await batch.commit();
}