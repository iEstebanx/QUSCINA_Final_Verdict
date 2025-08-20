// services/Discounts/discounts.js
import {
  collection, doc, setDoc, updateDoc, deleteDoc,
  onSnapshot, query, orderBy, serverTimestamp, writeBatch,
  runTransaction, increment
} from "firebase/firestore";
import { db } from "@/utils/firebaseConfig";

const colRef = collection(db, "discounts");
const countersRef = doc(db, "_meta", "counters"); // stores { discountsSeq: number }

// e.g., 1 -> DISC-000001 ; 1234567 -> DISC-1234567 (auto grows)
function formatDiscCode(n) {
  const width = Math.max(6, String(n).length);
  return `DISC-${String(n).padStart(width, "0")}`;
}

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

/**
 * Create a discount with an auto-generated unique sequential code.
 * Only pass name/value (+optional flags). The document ID is the code.
 */
export async function createDiscountAuto({
  name,
  value,
  type = "percent",
  scope = "order",
  isStackable = false,
  requiresApproval = false,
  isActive = true,
}) {
  if (!name) throw new Error("Name is required");
  if (value == null || Number.isNaN(Number(value))) throw new Error("Value is required");

  const { code, refId } = await runTransaction(db, async (tx) => {
    // Ensure counter doc exists
    const countersSnap = await tx.get(countersRef);
    if (!countersSnap.exists()) {
      tx.set(countersRef, { discountsSeq: 0 }); // bootstrap once
    }

    // Atomically increment
    tx.update(countersRef, { discountsSeq: increment(1) });

    const nextSeq = (countersSnap.data()?.discountsSeq ?? 0) + 1;
    const code = formatDiscCode(nextSeq);
    const ref = doc(colRef, code);

    // Assert uniqueness on the ID (super rare conflict)
    const existsSnap = await tx.get(ref);
    if (existsSnap.exists()) {
      throw new Error("Code collision, please retry.");
    }

    tx.set(ref, {
      code,
      name: name.trim(),
      type,
      value: Number(value),
      scope,
      isStackable,
      requiresApproval,
      isActive,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return { code, refId: ref.id };
  });

  return { code, refId };
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

// Bulk delete by codes (IDs)
export async function deleteMany(codes = []) {
  const batch = writeBatch(db);
  codes.forEach((c) => batch.delete(doc(colRef, c)));
  await batch.commit();
}