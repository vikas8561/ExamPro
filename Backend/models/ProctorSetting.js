const mongoose = require("mongoose");

/**
 * System-wide proctoring settings. Exactly one document ever exists.
 *
 * Its job today is to hold the single global bypass OTP — one code for the
 * whole system, which an admin reads out to a student whose webcam, microphone
 * or location is broken. It replaces the old per-test OTP, which was generated
 * for every test, shown in the admin test list, and searchable through the
 * tests API.
 *
 * The code is stored in plain text on purpose: an admin has to be able to read
 * it back to tell someone. It is protected by never leaving an admin-only
 * endpoint — it is not on the Test document, not in any student payload, and
 * not in any search index. It waives camera, microphone and location only;
 * fullscreen, tab switching, keyboard and clipboard rules stay fully active.
 */

const SINGLETON_KEY = "global";

const ProctorSettingSchema = new mongoose.Schema(
  {
    // Fixed value, uniquely indexed, so a second settings document cannot exist.
    key: {
      type: String,
      default: SINGLETON_KEY,
      unique: true,
      immutable: true,
    },

    bypassOtp: { type: String, default: null },
    bypassOtpUpdatedAt: { type: Date, default: null },
    bypassOtpUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
  },
  { timestamps: true }
);

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * Fetch the settings document, creating it with a fresh OTP on first use so the
 * system is never in a state where no bypass code exists.
 */
ProctorSettingSchema.statics.getSettings = async function () {
  let settings = await this.findOne({ key: SINGLETON_KEY });

  if (!settings) {
    settings = await this.create({
      key: SINGLETON_KEY,
      bypassOtp: generateOtp(),
      bypassOtpUpdatedAt: new Date(),
    });
  } else if (!settings.bypassOtp) {
    settings.bypassOtp = generateOtp();
    settings.bypassOtpUpdatedAt = new Date();
    await settings.save();
  }

  return settings;
};

/** Replace the code with a new random one. Admin action. */
ProctorSettingSchema.statics.rotateOtp = async function (adminUserId) {
  const settings = await this.getSettings();
  settings.bypassOtp = generateOtp();
  settings.bypassOtpUpdatedAt = new Date();
  settings.bypassOtpUpdatedBy = adminUserId || null;
  await settings.save();
  return settings;
};

/**
 * Constant-time comparison, so the endpoint cannot be probed a digit at a time
 * by measuring how long it takes to answer.
 */
ProctorSettingSchema.statics.verifyOtp = async function (candidate) {
  if (!candidate || typeof candidate !== "string") return false;

  const settings = await this.getSettings();
  const expected = settings.bypassOtp || "";

  if (candidate.length !== expected.length) return false;

  let mismatch = 0;
  for (let i = 0; i < expected.length; i += 1) {
    mismatch |= candidate.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
};

module.exports = mongoose.model("ProctorSetting", ProctorSettingSchema);
