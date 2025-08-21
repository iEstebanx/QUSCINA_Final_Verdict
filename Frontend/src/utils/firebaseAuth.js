// src/utils/firebaseAuth.js
import {
  getAuth,
  signInAnonymously,
  setPersistence,
  inMemoryPersistence,
  onAuthStateChanged,
} from "firebase/auth";
import { app } from "@/utils/firebaseConfig";

export async function ensureSignedIn() {
  const auth = getAuth(app);

  // Keep auth in memory only (clears on tab refresh/close)
  await setPersistence(auth, inMemoryPersistence);

  if (!auth.currentUser) {
    await signInAnonymously(auth);
  }
  return auth;
}

// (Optional helper if you use it elsewhere)
export function onAuthChanged(cb) {
  const auth = getAuth(app);
  return onAuthStateChanged(auth, cb);
}