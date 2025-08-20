// Backend/src/routes/firebaseAdmin.js
const admin = require("firebase-admin");

if (!admin.apps.length) {
  if (process.env.FB_ADMIN_JSON) {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(process.env.FB_ADMIN_JSON)),
    });
  } else {
    admin.initializeApp(); // uses GOOGLE_APPLICATION_CREDENTIALS
  }
}

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

module.exports = { admin, db, FieldValue };