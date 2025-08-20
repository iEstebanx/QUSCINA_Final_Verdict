// src/utils/firestoreNetwork.js
import { disableNetwork, enableNetwork, setLogLevel } from "firebase/firestore";
import { db } from "@/utils/firebaseConfig";

export function initFirestoreNetworkAutoToggle() {
  // Quiet Firestore logs (optional: 'error' or 'silent')
  setLogLevel("error");

  const goOffline = () => disableNetwork(db).catch(() => {});
  const goOnline  = () => enableNetwork(db).catch(() => {});

  // Set initial state
  if (!navigator.onLine) goOffline();

  // React to connectivity changes
  window.addEventListener("offline", goOffline);
  window.addEventListener("online", goOnline);

  // Cleanup (call this if you ever unmount the app root)
  return () => {
    window.removeEventListener("offline", goOffline);
    window.removeEventListener("online", goOnline);
  };
}