const express = require("express");
const rateLimit = require("express-rate-limit");
const router = express.Router();

const { authenticateToken } = require("../middleware/auth");
const Assignment = require("../models/Assignment");
const Test = require("../models/Test");
const ProctorSetting = require("../models/ProctorSetting");
const policyService = require("../services/proctorPolicy");
const sebVerify = require("../services/sebVerify");
const { buildSebConfig, optionsFor } = require("../services/sebConfig");

/**
 * Handing a student over to Safe Exam Browser.
 *
 * Two steps. The student's ordinary browser asks for a launch link, which
 * carries a short-lived signed token. Clicking it hands the URL to the operating
 * system, which starts SEB, which fetches the config file from here and opens
 * the exam inside its own locked-down browser.
 *
 * The config endpoint cannot sit behind `authenticateToken`: SEB fetches it as a
 * plain download with no Authorization header. The signed token stands in for
 * the login, and is bound to one student and one assignment so a link forwarded
 * to a classmate opens nothing.
 */

/** Same shape of protection as the bypass endpoint in routes/proctor.js. */
const configLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many configuration requests. Please wait and try again." },
});

/** Strip a trailing slash so URLs are built the same way every time. */
function frontendOrigin() {
  const raw = process.env.FRONTEND_URL || "";
  return raw.replace(/\/+$/, "");
}

/**
 * Where this attempt's exam lives, including the per-attempt nonce.
 *
 * This exact string is what SEB hashes its Browser Exam Key with, so it is
 * stored verbatim and never rebuilt from parts at verification time — a single
 * character of difference would fail every check.
 *
 * Note where the nonce is *not*: the .seb configuration file. SEB derives the
 * Browser Exam Key from its configuration, so a per-attempt start URL would give
 * every attempt a different key and nothing an administrator pasted could ever
 * match. The config is identical for everyone; only this page URL varies.
 */
function buildExamUrl(assignment, test, nonce) {
  const path =
    String(test?.type || "").toLowerCase() === "coding"
      ? "take-coding"
      : "take-test";
  return `${frontendOrigin()}/student/${path}/${assignment._id}?n=${nonce}`;
}

/**
 * Mint this attempt's nonce, or return the one it already has.
 *
 * Deliberately stable for the life of the attempt. Rotating it would change the
 * exam URL, which would change every key hash SEB produces, which would lock out
 * a student whose machine restarted and relaunched SEB mid-exam.
 */
async function getOrCreateLaunch(assignment, test) {
  if (assignment.sebLaunch?.nonce && assignment.sebLaunch?.examUrl) {
    return assignment.sebLaunch;
  }

  const nonce = sebVerify.generateNonce();
  assignment.sebLaunch = {
    nonce,
    examUrl: buildExamUrl(assignment, test, nonce),
    issuedAt: new Date(),
  };
  await assignment.save();
  return assignment.sebLaunch;
}

/**
 * The exam address this attempt must be opened at, nonce included.
 *
 * Called by the exam page when it finds itself running inside SEB without a
 * nonce — which is every time, because SEB starts at the assignments list and
 * the student navigates from there. The page then reloads itself at this
 * address, and SEB recomputes its key hash for the new URL.
 */
router.post("/exam-url", authenticateToken, async (req, res, next) => {
  try {
    const { assignmentId } = req.body || {};
    if (!assignmentId || typeof assignmentId !== "string" || assignmentId.length !== 24) {
      return res.status(400).json({ message: "Valid assignmentId is required" });
    }
    if (!frontendOrigin()) {
      return res.status(500).json({
        message: "Safe Exam Browser is not configured on this server (FRONTEND_URL is unset).",
      });
    }

    const assignment = await Assignment.findOne({
      _id: assignmentId,
      userId: req.user.userId,
    });
    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found" });
    }

    const test = await Test.findById(assignment.testId).select(
      "type isPracticeTest practiceTestSettings"
    );
    if (!test) {
      return res.status(404).json({ message: "Test not found" });
    }

    const launch = await getOrCreateLaunch(assignment, test);
    return res.json({ examUrl: launch.examUrl });
  } catch (error) {
    next(error);
  }
});

/**
 * Give the student a link that opens this exam in Safe Exam Browser.
 *
 * `sebs://` is SEB's own URL scheme for a config file served over HTTPS; the
 * operating system hands it to SEB the way it would hand `mailto:` to a mail
 * client. The scheme replaces `https://`, so the link is otherwise the ordinary
 * config URL.
 */
router.post("/launch", authenticateToken, async (req, res, next) => {
  try {
    const { assignmentId } = req.body || {};
    if (!assignmentId || typeof assignmentId !== "string" || assignmentId.length !== 24) {
      return res.status(400).json({ message: "Valid assignmentId is required" });
    }

    if (!frontendOrigin()) {
      return res.status(500).json({
        message: "Safe Exam Browser is not configured on this server (FRONTEND_URL is unset).",
      });
    }

    const assignment = await Assignment.findOne({
      _id: assignmentId,
      userId: req.user.userId,
    });
    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found" });
    }
    if (assignment.status === "Completed") {
      return res.status(400).json({ message: "This test has already been submitted" });
    }
    if (assignment.status === "Cancelled") {
      return res.status(400).json({ message: "This test has been cancelled" });
    }

    const test = await Test.findById(assignment.testId).select(
      "type isPracticeTest practiceTestSettings"
    );
    if (!test) {
      return res.status(404).json({ message: "Test not found" });
    }
    if (!policyService.isProctoredTest(test)) {
      return res.status(400).json({
        message: "This test is not proctored and does not use Safe Exam Browser.",
      });
    }

    const settings = await ProctorSetting.getSettings();
    const launch = await getOrCreateLaunch(assignment, test);

    const token = sebVerify.signLaunchToken({
      userId: req.user.userId,
      assignmentId: String(assignment._id),
      nonce: launch.nonce,
      secret: settings.sebLaunchSecret,
    });

    // The config URL points back at this API, wherever it is deployed. Behind a
    // proxy `req.protocol` follows X-Forwarded-Proto because server.js trusts it.
    const apiOrigin = `${req.protocol}://${req.get("host")}`;
    const configUrl = `${apiOrigin}/api/seb/config/${assignment._id}.seb?t=${encodeURIComponent(token)}`;

    return res.json({
      // What the student clicks. Only the scheme differs from configUrl.
      launchUrl: configUrl.replace(/^https:\/\//, "sebs://").replace(/^http:\/\//, "seb://"),
      configUrl,
      examUrl: launch.examUrl,
      expiresInMs: sebVerify.LAUNCH_TOKEN_TTL_MS,
    });
  } catch (error) {
    next(error);
  }
});

// --- Config file ---------------------------------------------------------

/**
 * Serve the config file to SEB.
 *
 * Unauthenticated by necessity — SEB has no login session — so everything rests
 * on the signed token, which names the student, the assignment and an expiry.
 * Not single-use: SEB refetches this whenever it relaunches, and a one-shot
 * token would strand a student whose machine restarted mid-exam.
 */
router.get("/config/:assignmentId.seb", configLimiter, async (req, res, next) => {
  try {
    const { assignmentId } = req.params;
    const token = typeof req.query.t === "string" ? req.query.t : "";

    const settings = await ProctorSetting.getSettings();
    const claims = sebVerify.verifyLaunchToken({
      token,
      secret: settings.sebLaunchSecret,
    });

    if (!claims || claims.assignmentId !== assignmentId) {
      return res.status(403).json({ message: "This Safe Exam Browser link is invalid or has expired." });
    }

    const assignment = await Assignment.findOne({
      _id: assignmentId,
      userId: claims.userId,
    }).select("sebLaunch testId");

    if (!assignment || assignment.sebLaunch?.nonce !== claims.nonce) {
      return res.status(403).json({ message: "This Safe Exam Browser link is no longer valid." });
    }

    const apiOrigin = `${req.protocol}://${req.get("host")}`;
    const body = buildSebConfig(optionsFor(req, await ProctorSetting.getSebConfig()));

    res.setHeader("Content-Type", "application/seb");
    res.setHeader("Content-Disposition", `attachment; filename="exam-${assignmentId}.seb"`);
    // The link carries a credential, so it must not sit in any shared cache.
    res.setHeader("Cache-Control", "no-store, private");
    return res.send(body);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
