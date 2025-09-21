// Backend/src/shared/Firebase/firebaseAdmin.js
const admin = require("firebase-admin");

if (!admin.apps.length) {
  const storageBucket = process.env.FIREBASE_STORAGE_BUCKET; // e.g. "your-project-id.appspot.com"

  // Prefer ADC (GOOGLE_APPLICATION_CREDENTIALS) or FB_ADMIN_JSON if you use it
  if (process.env.FB_ADMIN_JSON) {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(process.env.FB_ADMIN_JSON)),
      ...(storageBucket ? { storageBucket } : {}),
    });
  } else {
    admin.initializeApp({
      // Uses ADC (GOOGLE_APPLICATION_CREDENTIALS or gcloud local creds)
      ...(storageBucket ? { storageBucket } : {}),
    });
  }
}

const db = admin.firestore();

// Try to obtain a usable Storage bucket
let bucket = null;
try {
  bucket = admin.storage().bucket(
    process.env.FIREBASE_STORAGE_BUCKET || undefined
  );
  if (!bucket || typeof bucket.file !== "function") bucket = null;
} catch {
  bucket = null;
}

module.exports = {
  admin,
  db,
  bucket, // ⬅️ now exported
  FieldValue: admin.firestore.FieldValue,
  Timestamp: admin.firestore.Timestamp,
};