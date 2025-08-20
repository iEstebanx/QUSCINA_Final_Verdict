// Import the functions you need from the SDKs you need
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  enableIndexedDbPersistence,
} from "firebase/firestore";

// 🔐 keep these in env vars in production
const firebaseConfig = {
  apiKey:        import.meta.env.VITE_FB_API_KEY,
  authDomain:    "quscina-7573c.firebaseapp.com",
  projectId:     "quscina-7573c",
  storageBucket: "quscina-7573c.firebasestorage.app",
  messagingSenderId: "52768083370",
  appId:         import.meta.env.VITE_FB_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// Offline-first: cache in IndexedDB & queue writes while offline
enableIndexedDbPersistence(db).catch((err) => {
  // Works on most browsers; fallbacks for multi-tab
  console.warn("IndexedDB persistence not enabled:", err.code);
});