// src/utils/firebaseAuth.js
import { getAuth, signInAnonymously, setPersistence, browserLocalPersistence, onAuthStateChanged } from "firebase/auth";
import { app } from "@/utils/firebaseConfig"; // export app in your config

export async function ensureSignedIn() {
  const auth = getAuth(app);
  await setPersistence(auth, browserLocalPersistence);
  if (!auth.currentUser) {
    await signInAnonymously(auth); // needs to succeed at least once online
  }
  return auth;
}