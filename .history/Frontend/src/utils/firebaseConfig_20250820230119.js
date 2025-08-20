// Import the functions you need from the SDKs you need
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// src/utils/firebaseConfig.js
import { initializeApp } from "firebase/app";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
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

export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  // helps in dev/proxy/adblock situations:
  experimentalAutoDetectLongPolling: true,
});