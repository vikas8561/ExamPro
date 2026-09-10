/**
 * One-time cleanup: remove stored face descriptors.
 *
 * Face recognition has been removed from ExamPro entirely. The code is gone,
 * but the biometric templates it collected are still sitting in the users
 * collection — a 128-number face descriptor per student, kept for a feature
 * that no longer exists.
 *
 * This clears them. Profile photos are deliberately left alone: those are
 * ordinary display images and are still used.
 *
 * Run once after deploying:
 *
 *   node scripts/dropFaceDescriptors.js
 *
 * It is safe to run more than once — the second run simply finds nothing.
 */

const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config();

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error("❌ No MONGODB_URI in the environment. Nothing was changed.");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log("✅ Connected");

  // Written against the raw collection on purpose: these fields no longer exist
  // on the User schema, so Mongoose would strip them from the update.
  const users = mongoose.connection.db.collection("users");

  const affected = await users.countDocuments({
    $or: [
      { faceDescriptor: { $exists: true } },
      { faceDescriptorSaved: { $exists: true } },
    ],
  });

  if (affected === 0) {
    console.log("✅ No face descriptors found. Nothing to do.");
    await mongoose.disconnect();
    return;
  }

  console.log(`🔍 Found ${affected} user(s) holding face data. Removing…`);

  const result = await users.updateMany(
    {
      $or: [
        { faceDescriptor: { $exists: true } },
        { faceDescriptorSaved: { $exists: true } },
      ],
    },
    { $unset: { faceDescriptor: "", faceDescriptorSaved: "" } }
  );

  console.log(`✅ Cleared face data for ${result.modifiedCount} user(s).`);
  console.log("   Profile photos were left untouched.");

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error("❌ Cleanup failed:", error.message);
  process.exit(1);
});
