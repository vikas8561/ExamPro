/**
 * Seeds the ExamPro identity collections that logins now read from.
 *
 *   node scripts/seedAuthCollections.js
 *
 * Creates the `admins` and `mentors` collections and their indexes, and adds the
 * initial admin account. Safe to re-run: an existing admin with the same email
 * is left exactly as it is, so a changed password is never clobbered.
 */
require("dotenv").config();
const mongoose = require("mongoose");
const { connectDB } = require("../configs/db.config");
const Admin = require("../models/Admin");
const Mentor = require("../models/Mentor");

const SEED_ADMIN = { name: "Neel", email: "neel@gmail.com", password: "neel@admin" };

(async () => {
  try {
    await connectDB(process.env.MONGODB_URI);

    const existing = await Admin.findOne({ email: SEED_ADMIN.email });
    if (existing) {
      console.log(`ℹ️  Admin ${SEED_ADMIN.email} already exists - left unchanged`);
    } else {
      // Go through save() so the schema's pre-save hook hashes the password.
      await new Admin(SEED_ADMIN).save();
      console.log(`✅ Created admin ${SEED_ADMIN.email}`);
    }

    // Make sure both collections and their unique email indexes exist even when
    // no mentor has been created yet.
    await Admin.createCollection().catch(() => {});
    await Mentor.createCollection().catch(() => {});
    await Admin.syncIndexes();
    await Mentor.syncIndexes();

    console.log(`📊 admins: ${await Admin.countDocuments()}, mentors: ${await Mentor.countDocuments()}`);
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error("❌ Seed failed:", err.message);
    process.exit(1);
  }
})();
