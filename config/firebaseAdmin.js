const { initializeApp, getApps, cert } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");

const firebaseConfig = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY
    ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")
    : undefined,
};

let app;

if (getApps().length === 0) {
  app = initializeApp({
    credential: cert(firebaseConfig),
  });
} else {
  app = getApps()[0];
}

const adminAuth = getAuth(app);
const db = getFirestore(app);

module.exports = {
  admin: app,
  adminAuth,
  db,
};
