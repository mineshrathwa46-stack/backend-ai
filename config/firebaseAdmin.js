const { initializeApp, cert } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

const serviceAccount = require("../serviceAccountKey.json");

const firebaseApp = initializeApp({
  credential: cert(serviceAccount),
});

console.log("🔥 Firebase Admin initialized");

const adminAuth = getAuth(firebaseApp);

module.exports = {
  adminAuth,
};