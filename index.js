const cors = require("cors");
const express = require("express");
require("dotenv").config();
const admin = require("firebase-admin");
const path = require("path");
const fs = require("fs");
const multer = require("multer");

const app = express();
const PORT = process.env.PORT || 3001;

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

// Middlewares - MUST BE BEFORE ROUTES
app.use(cors({ origin: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend
app.use(express.static(path.join(__dirname, "frontend")));

// Multer configuration
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

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
    const ref = db.ref("guestbook");
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
    const ref = db.ref(`guestbook/${req.params.key}`);
    const snapshot = await ref.once("value");
    res.json(snapshot.val());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/entries/:key", async (req, res) => {
  try {
    const db = admin.database();
    const ref = db.ref(`guestbook/${req.params.key}`);
    await ref.update(req.body);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/entries/:key", async (req, res) => {
  try {
    const db = admin.database();
    const ref = db.ref(`guestbook/${req.params.key}`);
    await ref.remove();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/entries-all", async (req, res) => {
  try {
    const db = admin.database();
    const ref = db.ref("guestbook");
    await ref.remove();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


app.post("/submit-form", upload.fields([
  { name: 'photo1', maxCount: 1 },
  { name: 'photo2', maxCount: 1 }
]), async (req, res) => {
  console.log("📥 Received submit-form request");
  console.log("Files received:", req.files ? Object.keys(req.files) : 'No files');
  console.log("Body:", req.body);

  try {
    console.log("🔧 Initializing Firebase services...");
    const db = admin.database();
    const bucket = admin.storage().bucket();
    const { outfit } = req.body;
    const timestamp = admin.database.ServerValue.TIMESTAMP;

    let photo1Url = null;
    let photo2Url = null;

    // Upload Photo 1
    if (req.files && req.files['photo1']) {
      console.log("📸 Uploading photo1...");
      const file1 = req.files['photo1'][0];
      const destFileName1 = `uploads/${Date.now()}_photo1.jpg`;
      const fileRef1 = bucket.file(destFileName1);

      await fileRef1.save(file1.buffer, {
        metadata: { contentType: file1.mimetype },
        public: true,
      });

      photo1Url = `https://storage.googleapis.com/${bucket.name}/${destFileName1}`;
      console.log("✅ Photo1 uploaded:", photo1Url);
    } else {
      console.log("⚠️ No photo1 found in request");
    }

    // Upload Photo 2
    if (req.files && req.files['photo2']) {
      console.log("📸 Uploading photo2...");
      const file2 = req.files['photo2'][0];
      const destFileName2 = `uploads/${Date.now()}_photo2.jpg`;
      const fileRef2 = bucket.file(destFileName2);

      await fileRef2.save(file2.buffer, {
        metadata: { contentType: file2.mimetype },
        public: true,
      });

      photo2Url = `https://storage.googleapis.com/${bucket.name}/${destFileName2}`;
      console.log("✅ Photo2 uploaded:", photo2Url);
    } else {
      console.log("⚠️ No photo2 found in request");
    }

    console.log("💾 Saving to database...");

    // Parse outfit from JSON string to object
    let outfitData = {};
    try {
      outfitData = outfit ? JSON.parse(outfit) : {};
      console.log("📦 Outfit data:", outfitData);
    } catch (e) {
      console.error("⚠️ Failed to parse outfit:", e);
      outfitData = {};
    }

    const ref = db.ref("guestbook");
    const newRef = await ref.push({
      photo1Url,
      photo2Url,
      outfit: outfitData, // Store as object, not string
      timestamp
    });
    const newKey = newRef.key;
    console.log("✅ Data saved with key:", newKey);

    res.status(200).json({
      success: true,
      key: newKey,
      photo1Url,
      photo2Url,
      outfit
    });
  } catch (error) {
    console.error("🔥 Error submitting data:", error.message);
    console.error("Stack trace:", error.stack);
    res.status(500).json({
      error: error.message,
      details: error.stack
    });
  }
});


// Start server - MUST BE AT THE END
app.listen(PORT, () => {
  console.log(`🚀 Server running on port: ${PORT}`);
});
