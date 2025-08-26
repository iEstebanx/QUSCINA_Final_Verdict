// Frontend/src/utils/firebaseConfig.js
import { initializeApp } from "firebase/app";
import {
  initializeFirestore,
  memoryLocalCache, // <- in-memory cache only (no IndexedDB/disk)
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FB_API_KEY,
  authDomain: "quscina-7573c.firebaseapp.com",
  projectId: "quscina-7573c",
  storageBucket: "quscina-7573c.firebasestorage.app",
  messagingSenderId: "52768083370",
  appId: import.meta.env.VITE_FB_APP_ID,
};

export const app = initializeApp(firebaseConfig);

// Firestore with NO persistent offline cache.
// This keeps only a small, ephemeral in-memory cache for the current tab.
export const db = initializeFirestore(app, {
  localCache: memoryLocalCache(),
  // If your environment needs it, you can keep this transport tweak.
  // It doesn't enable offline, it's just a networking fallback.
  // experimentalAutoDetectLongPolling: true,
});