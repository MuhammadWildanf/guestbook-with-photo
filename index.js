const cors = require("cors");
const express = require("express");
require("dotenv").config();
const admin = require("firebase-admin");
const path = require("path");
const fs = require("fs");
const multer = require("multer");

const app = express();
const PORT = process.env.PORT || 3000;

// Start server
app.listen(PORT, () => {
  console.log(`Server running in port:${PORT}`);
});

// Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert({
    type: process.env.FIREBASE_TYPE,
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
    auth_uri: process.env.FIREBASE_AUTH_URI,
    token_uri: process.env.FIREBASE_TOKEN_URI,
    auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_CERT_URL,
    client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL,
    universe_domain: process.env.FIREBASE_UNIVERSE_DOMAIN,
  }),
  databaseURL:
    "https://guestbook-with-photo-446da-default-rtdb.asia-southeast1.firebasedatabase.app",
  storageBucket: "guestbook-with-photo-446da.firebasestorage.app",
});

// Serve frontend
app.use(express.static(path.join(__dirname, "frontend")));

// Folder uploads

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});


// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({ origin: true }));

// Routes

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "frontend", "index.html"));
});

app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "frontend", "dashboard.html"));
});


// Ambil semua data
app.get("/entries", async (req, res) => {
  try {
    const db = admin.database();
    const ref = db.ref("testguest");
    const snapshot = await ref.once("value");
    res.json(snapshot.val());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Ambil data by key
app.get("/entries/:key", async (req, res) => {
  try {
    const db = admin.database();
    const ref = db.ref(`testguest/${req.params.key}`);
    const snapshot = await ref.once("value");
    res.json(snapshot.val());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/entries/:key", async (req, res) => {
  try {
    const db = admin.database();
    const ref = db.ref(`testguest/${req.params.key}`);
    await ref.update(req.body);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/entries/:key", async (req, res) => {
  try {
    const db = admin.database();
    const ref = db.ref(`testguest/${req.params.key}`);
    await ref.remove();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/entries-all", async (req, res) => {
  try {
    const db = admin.database();
    const ref = db.ref("testguest");
    await ref.remove();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


app.post("/submit-form", upload.single("photo"), async (req, res) => {
  try {
    const db = admin.database();
    const bucket = admin.storage().bucket();
    const { name, comment } = req.body;
    const timestamp = admin.database.ServerValue.TIMESTAMP;

    let photoUrl = null;

    if (req.file) {
      const destFileName = `uploads/${Date.now()}_${req.file.originalname.replace(/\s+/g, "_")}`;
      const file = bucket.file(destFileName);

      await file.save(req.file.buffer, {
        metadata: { contentType: req.file.mimetype },
        public: true, // langsung bisa diakses publik
      });

      photoUrl = `https://storage.googleapis.com/${bucket.name}/${destFileName}`;
    }

    const ref = db.ref("testguest");
    const newRef = await ref.push({ name, comment, photoUrl, timestamp });
    const newKey = newRef.key;

    res.status(200).json({
      success: true,
      key: newKey,
      name,
      comment,
      photoUrl,
    });
  } catch (error) {
    console.error("🔥 Error submitting data:", error.message, error.stack);
    res.status(500).json({ error: error.message });
  }
});


