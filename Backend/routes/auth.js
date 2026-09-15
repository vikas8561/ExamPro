const express = require("express");
const bcrypt = require("bcrypt");
const router = express.Router();

const Student = require("../models/Student");
const Mentor = require("../models/Mentor");
const Admin = require("../models/Admin");
const Profile = require("../models/Profile");
const {
  generateToken,
  authenticateToken,
  startSession,
  endSession,
} = require("../middleware/auth");
const {
  normalizeStudent,
  normalizeMentor,
  normalizeAdmin,
  findPrincipalById,
} = require("../services/principals");

// Brute-force protection. Blocking used to be a flag on the User document, but
// student records belong to the university's database and ExamPro only reads
// from it, so the counter is kept in memory here: 3 wrong passwords inside 5
// minutes locks that identifier out for 30 minutes.
const MAX_ATTEMPTS = 3;
const ATTEMPT_WINDOW_MS = 5 * 60 * 1000;
const LOCKOUT_MS = 30 * 60 * 1000;
const failedAttempts = new Map(); // identifier -> { count, firstAt, lockedUntil }

function lockoutRemaining(key) {
  const entry = failedAttempts.get(key);
  if (!entry?.lockedUntil) return 0;
  const remaining = entry.lockedUntil - Date.now();
  if (remaining <= 0) {
    failedAttempts.delete(key);
    return 0;
  }
  return remaining;
}

function recordFailure(key) {
  const now = Date.now();
  const entry = failedAttempts.get(key);
  if (!entry || now - entry.firstAt > ATTEMPT_WINDOW_MS) {
    failedAttempts.set(key, { count: 1, firstAt: now, lockedUntil: null });
    return;
  }
  entry.count += 1;
  if (entry.count >= MAX_ATTEMPTS) {
    entry.lockedUntil = now + LOCKOUT_MS;
  }
}

// Roll numbers and UIDs are stored the way the university typed them
// ("24BTCSE095"), so match them case-insensitively without letting user input
// reach the regex engine as a pattern.
function exactInsensitive(value) {
  return new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
}

// Login. An identifier containing "@" is an email, so it belongs to an ExamPro
// admin or mentor; anything else is a student's UniversityUID or roll number and
// is checked against the university's student database.
router.post("/login", async (req, res) => {
  try {
    const rawIdentifier = req.body.identifier ?? req.body.email;
    const { password } = req.body;

    const identifier = typeof rawIdentifier === "string" ? rawIdentifier.trim() : "";
    if (!identifier || !password) {
      return res.status(400).json({ message: "Please enter your UniversityUID / Roll No and password" });
    }

    const lockKey = identifier.toLowerCase();
    const remaining = lockoutRemaining(lockKey);
    if (remaining > 0) {
      return res.status(403).json({
        message: `Too many failed attempts. Please try again in ${Math.ceil(remaining / 60000)} minute(s).`,
      });
    }

    const invalid = () => {
      recordFailure(lockKey);
      return res.status(401).json({ message: "Invalid credentials" });
    };

    let principal = null;
    let hash = null;

    if (identifier.includes("@")) {
      const email = identifier.toLowerCase();
      const admin = await Admin.findOne({ email }).select("name email password").lean();
      if (admin) {
        principal = normalizeAdmin(admin);
        hash = admin.password;
      } else {
        const mentor = await Mentor.findOne({ email }).select("name email password").lean();
        if (mentor) {
          principal = normalizeMentor(mentor);
          hash = mentor.password;
        }
      }
    } else {
      const match = exactInsensitive(identifier);
      const student = await Student.findOne({
        $or: [{ UniversityUID: match }, { rollno: match }],
      })
        .select("studentName studentEmail UniversityUID rollno University password")
        .lean();
      if (student) {
        principal = normalizeStudent(student);
        hash = student.password;
      }
    }

    if (!principal || !hash) return invalid();

    const isMatch = await bcrypt.compare(password, hash);
    if (!isMatch) return invalid();

    failedAttempts.delete(lockKey);

    const token = generateToken(principal);
    await startSession(principal, token);

    res.json({ user: principal, token, message: "Login successful" });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Login failed. Please try again." });
  }
});

// Logout endpoint
router.post("/logout", async (req, res) => {
  try {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];
    if (token) await endSession(token);
    res.json({ message: "Logout successful" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get current user profile
router.get("/profile", authenticateToken, async (req, res) => {
  try {
    const principal = await findPrincipalById(req.user.userId, req.user.role);
    if (!principal) {
      return res.status(404).json({ message: "User not found" });
    }

    const profile = await Profile.findOne({ principalId: String(principal._id) })
      .select("profileImage profileImageSaved")
      .lean();

    res.json({
      ...principal,
      profileImage: profile?.profileImage || null,
      profileImageSaved: profile?.profileImageSaved || false,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Upload profile image (camera only, one-time)
router.post("/profile/image", authenticateToken, async (req, res) => {
  try {
    const { image } = req.body;

    if (!image) {
      return res.status(400).json({ message: "An image is required." });
    }

    if (!image.startsWith("data:image/")) {
      return res.status(400).json({ message: "Invalid image format. Only images from camera are allowed." });
    }

    const principalId = String(req.user.userId);
    const existing = await Profile.findOne({ principalId }).lean();

    // Still one-time only, matching the previous behaviour.
    if (existing?.profileImageSaved) {
      return res.status(400).json({ message: "Profile image can only be saved once and cannot be changed" });
    }

    await Profile.updateOne(
      { principalId },
      { $set: { role: req.user.role, profileImage: image, profileImageSaved: true } },
      { upsert: true }
    );

    res.json({
      message: "Profile image saved successfully",
      profileImage: image,
      profileImageSaved: true,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
