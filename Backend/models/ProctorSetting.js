const crypto = require("crypto");
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
 *
 * It also holds the Safe Exam Browser settings, for the same reason: a Browser
 * Exam Key is a secret the server needs in cleartext to compute the expected
 * hash, and it must never reach a student. It cannot live on the Test document —
 * `GET /api/tests/:id` returns the whole test to admins and mentors, and the
 * student path only strips question internals, so a top-level key there would
 * leak.
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

    // --- Safe Exam Browser ---

    // The global switch. While false nothing about SEB is enforced anywhere and
    // every exam behaves exactly as it did before SEB existed.
    sebRequired: { type: Boolean, default: false },

    // There is deliberately no key field here. Verification uses SEB's Config
    // Key, which this server derives from the configuration file it generates —
    // identical on Windows and macOS and across SEB versions, and so nothing an
    // administrator has to copy out of SEB's Configuration Tool by hand. See
    // services/sebConfig.js.

    // SEB's own URL filter, which confines the browser to this application and
    // its API. Worth having, but it fails in a way that is very hard to diagnose
    // from the outside: SEB auto-allows the start URL's domain, so the exam page
    // loads perfectly and only calls to the API host are dropped — which looks to
    // a student like "login failed" and gives no hint that a filter is involved.
    // Hence a switch, so it can be ruled out in one click.
    sebUrlFilter: { type: Boolean, default: true },

    // Below these, SEB either lacks the JavaScript API used for verification or
    // ships a WebView too old for the exam pages.
    sebMinVersions: {
      windows: { type: String, default: "3.10.0" },
      macos: { type: String, default: "3.6.0" },
    },

    // Signs the short-lived tokens on .seb config download links. Generated on
    // first use rather than configured, so there is no new env var to forget.
    sebLaunchSecret: { type: String, default: null },

    // The password that lets somebody quit Safe Exam Browser mid-exam.
    //
    // Stored in plain text for the same reason the bypass code above is: an
    // invigilator has to be able to read it off a screen and type it on a
    // student's machine. It is admin-only and never reaches a student payload.
    // What goes into the .seb file is its SHA-256, so the config a student can
    // open reveals nothing — hashing is the entire point.
    sebQuitPassword: { type: String, default: null },

    sebUpdatedAt: { type: Date, default: null },
    sebUpdatedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { timestamps: true }
);

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * Unlike the OTP above, this is never read aloud by a human, so it is generated
 * from the CSPRNG rather than Math.random.
 */
function generateLaunchSecret() {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Short enough for an invigilator to read aloud and type, random enough that the
 * SHA-256 in the config file cannot be worked backwards. Ambiguous characters
 * are left out so nobody loses an exam to an O read as a 0.
 */
function generateQuitPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(12);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

/** What SEB expects in `hashedQuitPassword`: lowercase hex SHA-256. */
function hashQuitPassword(password) {
  return crypto.createHash("sha256").update(String(password), "utf8").digest("hex");
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
      sebLaunchSecret: generateLaunchSecret(),
      sebQuitPassword: generateQuitPassword(),
    });
  } else {
    let dirty = false;

    if (!settings.bypassOtp) {
      settings.bypassOtp = generateOtp();
      settings.bypassOtpUpdatedAt = new Date();
      dirty = true;
    }

    // Back-fills the secret on documents created before SEB support existed.
    if (!settings.sebLaunchSecret) {
      settings.sebLaunchSecret = generateLaunchSecret();
      dirty = true;
    }

    if (!settings.sebQuitPassword) {
      settings.sebQuitPassword = generateQuitPassword();
      dirty = true;
    }

    if (dirty) await settings.save();
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

/** Everything the proctoring code needs to know about SEB, in one read. */
ProctorSettingSchema.statics.getSebConfig = async function () {
  const settings = await this.getSettings();

  return {
    required: settings.sebRequired === true,
    urlFilter: settings.sebUrlFilter !== false,
    minVersions: {
      windows: settings.sebMinVersions?.windows || "3.10.0",
      macos: settings.sebMinVersions?.macos || "3.6.0",
    },
    launchSecret: settings.sebLaunchSecret,
    quitPassword: settings.sebQuitPassword,
    // What actually goes into the .seb file. The password itself never does.
    quitPasswordHash: settings.sebQuitPassword
      ? hashQuitPassword(settings.sebQuitPassword)
      : "",
  };
};

/**
 * Admin action. Every field is optional, so the toggle can be flipped without
 * resending the version floors and vice versa.
 */
ProctorSettingSchema.statics.updateSeb = async function (changes, adminUserId) {
  const settings = await this.getSettings();
  const { required, urlFilter, minVersions } = changes || {};

  if (typeof required === "boolean") settings.sebRequired = required;
  if (typeof urlFilter === "boolean") settings.sebUrlFilter = urlFilter;

  if (minVersions && typeof minVersions === "object") {
    if (minVersions.windows) {
      settings.sebMinVersions.windows = String(minVersions.windows).slice(0, 20);
    }
    if (minVersions.macos) {
      settings.sebMinVersions.macos = String(minVersions.macos).slice(0, 20);
    }
  }

  settings.sebUpdatedAt = new Date();
  settings.sebUpdatedBy = adminUserId || null;
  await settings.save();
  return settings;
};

/** Replace the quit password with a new one. Admin action. */
ProctorSettingSchema.statics.rotateSebQuitPassword = async function (adminUserId) {
  const settings = await this.getSettings();
  settings.sebQuitPassword = generateQuitPassword();
  settings.sebUpdatedAt = new Date();
  settings.sebUpdatedBy = adminUserId || null;
  await settings.save();
  return settings;
};

ProctorSettingSchema.statics.hashQuitPassword = hashQuitPassword;

module.exports = mongoose.model("ProctorSetting", ProctorSettingSchema);
