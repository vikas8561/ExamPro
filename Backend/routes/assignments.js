const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Assignment = require("../models/Assignment");
const Test = require("../models/Test");
const {
  attach,
  COHORTS,
  getCohort,
  findStudentsByCohort,
  cohortCounts,
} = require("../services/principals");
const Student = require("../models/Student");
const Mentor = require("../models/Mentor");
const { authenticateToken, requireRole } = require("../middleware/auth");
const { getCachedTestIds, setCachedTestIds, invalidateTestCache } = require("../utils/testCache");
const { attachProctorStatus, mayServeQuestions } = require("../middleware/proctorSession");
const { sanitizeQuestions, canSeeAnswers } = require("../services/questionSanitizer");
const { resolveOrderedQuestions } = require("../services/questionOrder");
const { isAttemptExpired } = require("../services/attemptWindow");

/** Mongoose document -> plain object, so stripping actually sticks. */
function toPlain(value) {
  if (!value) return value;
  return typeof value.toObject === "function" ? value.toObject() : value;
}

/**
 * The assignment as a student may see it.
 *
 * Two things have to be taken off it.
 *
 * `questionOrder` is the student's own permutation. It tells them nothing they
 * cannot already see from the order of the questions themselves, but when
 * proctoring withholds the question list it would still hand over the ids and
 * the count -- so it does not go out to anyone who is not a reviewer.
 *
 * `testId` is the populated test, complete with every answer. Sanitising is
 * done on a detached plain copy (it has to be -- stripping in place on a
 * Mongoose document silently re-casts the answers back), which leaves this
 * second reference to the unsanitised original still hanging off the
 * assignment. Point it at the sanitised copy the caller already built, so the
 * two cannot disagree. The client reads its questions from `test` regardless.
 */
function forStudent(assignment, user, sanitizedTest) {
  const plain = toPlain(assignment);
  if (!plain || canSeeAnswers(user)) return plain;
  delete plain.questionOrder;
  if (plain.testId && sanitizedTest) plain.testId = sanitizedTest;
  return plain;
}

/**
 * Put a student's questions into their own order, and remember it.
 *
 * Call this on a PLAIN object, after sanitizeQuestions(), and only for a
 * student -- admins and mentors always get the canonical order. `testData` is
 * mutated in place; the chosen order is persisted on the assignment so a
 * refresh returns the same paper.
 *
 * The write is a targeted $set rather than assignment.save(): the proctoring
 * routes write to the same document throughout the exam, and a full save here
 * would race them and could roll back a violation record.
 */
async function applyStudentQuestionOrder(testData, assignment) {
  if (!testData || !Array.isArray(testData.questions) || !assignment) return;

  const { questions, order, changed } = resolveOrderedQuestions({
    test: testData,
    assignment,
    questions: testData.questions,
  });

  testData.questions = questions;

  if (changed) {
    await Assignment.updateOne({ _id: assignment._id }, { $set: { questionOrder: order } });
    // Keep the in-memory copy consistent, so a second call within the same
    // request (the /start route reads the assignment twice) does not reshuffle.
    assignment.questionOrder = order;
  }
}

// Get all assignments (admin only) - ULTRA FAST VERSION
router.get("/", authenticateToken, requireRole("admin"), async (req, res, next) => {
  try {
    const startTime = Date.now();
    const { status, userId, testId } = req.query;
    const query = {};

    if (status) query.status = status;
    if (userId) query.userId = userId;
    if (testId) query.testId = testId;

    // console.log('🚀 ULTRA FAST: Fetching assignments for admin');

    // ULTRA FAST: Get assignments with MINIMAL data
    const assignments = await Assignment.find(query)
      .select("testId userId mentorId status startTime duration deadline startedAt completedAt score autoScore mentorScore mentorFeedback reviewStatus timeSpent createdAt")
      .populate({
        path: "testId",
        select: "title type instructions timeLimit",
        match: { type: { $ne: "practice" } } // Exclude practice tests from admin assignments
      })
      .populate("mentorId", "name email")
      .sort({ createdAt: -1 })
      .lean(); // Use lean() for 2x faster queries

    // Filter out assignments where testId is null (due to the match filter
    // above), then resolve each student from the university's database.
    const filteredAssignments = await attach(
      assignments.filter(assignment => assignment.testId !== null),
      "userId",
      "Student"
    );

    const totalTime = Date.now() - startTime;
    // console.log(`✅ ULTRA FAST admin assignments completed in ${totalTime}ms - Found ${filteredAssignments.length} assignments`);

    res.json(filteredAssignments);
  } catch (error) {
    next(error);
  }
});

/**
 * The cards a student sees on Assigned Tests and on Coding Tests.
 *
 * This is one database round trip, and it has to stay one. Every extra await
 * here is a whole network hop to Atlas -- the queries themselves execute in
 * under a millisecond, so the wall-clock cost of this endpoint is almost
 * entirely the number of times it talks to the database. The previous version
 * issued six in sequence (test ids, count, page, populate test, populate
 * mentor, question counts) and spent half a second to a second doing nothing
 * but waiting, for nine cards.
 *
 * So the whole thing is a single aggregation:
 *
 *   $match     the student's assignments, off the { userId, startTime } index
 *   $lookup    the test, projected down to the card's fields, with its question
 *              count computed server-side instead of fetched and measured here
 *   $match     the test type this page shows -- done after the lookup, so the
 *              count, the page boundaries and the cards all describe one set
 *   $facet     the total and the page, from the same cursor
 *
 * The test-type filter used to be a separate cached query for "every test id
 * that is not a practice test", fed back in as a $in of 165 ids. Doing it in
 * the pipeline removes the round trip, the cache, and the staleness window
 * where a test created a moment ago was invisible to every student for five
 * minutes.
 */
router.get("/student", authenticateToken, async (req, res, next) => {
  try {
    if (req.user.role !== "Student") {
      return res.status(403).json({ message: "Access denied. Student access only." });
    }

    // The card list changes as tests are assigned, so it must not be cached.
    res.set("Cache-Control", "no-store");

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 9, 1), 50);
    const skip = (page - 1) * limit;

    // Types this page does not show at all. Coding exams live on their own
    // page, and the assigned-tests list used to drop them in the browser AFTER
    // the server had counted and paginated them -- so the header read "3 total
    // assignments - 2 showing", and a page could come back short for no visible
    // reason. Excluding them in the query keeps the count, the pages and the
    // list describing the same set.
    const excluded = String(req.query.exclude || "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    // `type=coding` asks for exactly one kind; otherwise it is everything bar
    // practice tests (which have their own page) and whatever the caller excluded.
    const testType = req.query.type;
    const typeFilter = testType
      ? { "testId.type": testType }
      : { "testId.type": { $nin: ["practice", ...excluded] } };

    // The list's own filters. These used to run in the browser over whichever
    // nine rows it had been sent, so searching found only matches that happened
    // to be on the current page and "Completed" showed fewer tests than the
    // Completed tile counted. They belong in the query, where the whole set is.
    //
    // `subject` and `search` narrow the scope, so the summary tiles are computed
    // after them. `status` is what the tiles themselves select between, so it is
    // applied later, per facet branch - otherwise choosing one status would zero
    // the other three tiles and there would be nothing left to click.
    const scope = {};
    if (req.query.subject && req.query.subject !== "all") {
      scope["testId.subject"] = req.query.subject;
    }
    const search = String(req.query.search || "").trim();
    if (search) {
      // Escaped: the student's own typing must not reach the regex engine as a
      // pattern.
      const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      scope.$or = [
        { "testId.title": rx },
        { "testId.type": rx },
        { "mentorId.name": rx },
        { effectiveStatus: rx },
      ];
    }

    const status = req.query.status;
    const statusFilter = status && status !== "all" ? { effectiveStatus: status } : null;

    // Attaching a graded percentage to a row. Used twice -- once for the cards
    // and once for the cumulative average -- and defined once so the tile can
    // never disagree with the points plotted beside it.
    const withScore = [
      {
        $lookup: {
          from: "testsubmissions",
          let: { assignmentId: "$_id" },
          as: "submission",
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$assignmentId", "$$assignmentId"] },
                // Interim rows written mid-test are not finished work. Legacy
                // documents have no flag at all, which reads as finalized, so
                // this must be $ne rather than $eq true.
                isFinalized: { $ne: false },
              },
            },
            { $project: { totalScore: 1, maxScore: 1 } },
          ],
        },
      },
      { $unwind: { path: "$submission", preserveNullAndEmptyArrays: true } },
      {
        $set: {
          // The submission is the better source -- it is what the student was
          // actually marked out of, even if the test has been edited since -- so
          // it wins whenever it carries a usable maximum. Otherwise fall back to
          // the assignment's own autoScore over the paper's derived worth, which
          // is what rescues the graded attempts that have no usable submission:
          // an abandoned attempt the sweep finalised at zero still scored zero,
          // and leaving it out flattered the average.
          scoreBasis: {
            $cond: [
              { $gt: [{ $ifNull: ["$submission.maxScore", 0] }, 0] },
              { total: "$submission.totalScore", max: "$submission.maxScore" },
              { total: "$autoScore", max: "$testId.maxMarks" },
            ],
          },
        },
      },
      {
        $set: {
          totalScore: "$scoreBasis.total",
          maxScore: "$scoreBasis.max",
          // null, not 0, when the test was never graded: a student who has not
          // sat a test has no score, and averaging a zero in would drag their
          // reported performance down.
          scorePercent: {
            $cond: [
              {
                $and: [
                  { $gt: [{ $ifNull: ["$scoreBasis.max", 0] }, 0] },
                  { $ne: [{ $ifNull: ["$scoreBasis.total", null] }, null] },
                ],
              },
              { $round: [{ $multiply: [{ $divide: ["$scoreBasis.total", "$scoreBasis.max"] }, 100] }, 0] },
              null,
            ],
          },
        },
      },
    ];

    // aggregate() does no schema casting, unlike find() -- userId is an
    // ObjectId on the document and a string in the token, so it has to be cast
    // by hand or the $match silently returns nothing.
    const userId = new mongoose.Types.ObjectId(String(req.user.userId));

    // One clock for the whole request: the pipeline classifies rows against it
    // and the auto-start below writes with it, so a test cannot be counted
    // Overdue by the database and then started a millisecond later here.
    const now = new Date();

    const [result] = await Assignment.aggregate([
      { $match: { userId } },
      {
        $lookup: {
          from: "tests",
          localField: "testId",
          foreignField: "_id",
          as: "testId",
          pipeline: [
            {
              $project: {
                title: 1,
                type: 1,
                instructions: 1,
                timeLimit: 1,
                subject: 1,
                // Counted where the questions already are. Shipping the array
                // back just to read its length was a second query over the same
                // documents.
                questionCount: { $size: { $ifNull: ["$questions", []] } },
                // What the paper is worth, mirroring maxMarksForQuestion() in
                // services/grading.js exactly: a coding question is worth the
                // sum of its hidden test cases' marks, falling back to `points`
                // only when none of them carry any, and `?? 1` rather than
                // `|| 1` so a deliberately zero-point question stays zero.
                //
                // Grading stores this on the submission at submit time, but 51
                // completed assignments have no submission row at all and 24
                // have one with maxScore 0, so 75 graded tests had no
                // denominator and silently vanished from the dashboard. Derived
                // here, they have one. If the rule in grading.js changes, this
                // has to change with it or the two will disagree.
                maxMarks: {
                  $sum: {
                    $map: {
                      input: { $ifNull: ["$questions", []] },
                      as: "q",
                      in: {
                        $let: {
                          vars: {
                            codingMarks: {
                              $cond: [
                                { $eq: ["$$q.kind", "coding"] },
                                {
                                  $sum: {
                                    $map: {
                                      input: { $ifNull: ["$$q.hiddenTestCases", []] },
                                      as: "h",
                                      in: { $ifNull: ["$$h.marks", 0] },
                                    },
                                  },
                                },
                                0,
                              ],
                            },
                          },
                          in: {
                            $cond: [
                              { $gt: ["$$codingMarks", 0] },
                              "$$codingMarks",
                              { $convert: { input: "$$q.points", to: "double", onError: 1, onNull: 1 } },
                            ],
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          ],
        },
      },
      // $unwind rather than preserveNullAndEmptyArrays: an assignment whose
      // test was deleted has no card to draw and must not be counted.
      { $unwind: "$testId" },
      { $match: typeFilter },
      // Ahead of the facet rather than inside the page branch, because `search`
      // matches on the mentor's name and so needs it resolved before filtering.
      // One indexed lookup over this student's own assignments.
      {
        $lookup: {
          from: "mentors",
          localField: "mentorId",
          foreignField: "_id",
          as: "mentorId",
          pipeline: [{ $project: { name: 1, email: 1 } }],
        },
      },
      // A mentor may legitimately be absent, so this one keeps the row.
      { $unwind: { path: "$mentorId", preserveNullAndEmptyArrays: true } },
      // The status a card actually displays, which is not always the status on
      // the document: an assignment past its deadline reads "Overdue", and one
      // whose window has opened reads "In Progress" because the auto-start
      // below is about to move it there. The summary counts are grouped on this
      // rather than on `status`, so the four tiles agree with the badges under
      // them instead of contradicting them.
      {
        $set: {
          effectiveStatus: {
            $switch: {
              branches: [
                { case: { $eq: ["$status", "Completed"] }, then: "Completed" },
                { case: { $eq: ["$status", "In Progress"] }, then: "In Progress" },
                { case: { $eq: ["$status", "Overdue"] }, then: "Overdue" },
                {
                  case: { $eq: ["$status", "Assigned"] },
                  then: {
                    $cond: [
                      {
                        $and: [
                          { $eq: ["$duration", "$testId.timeLimit"] },
                          { $lte: ["$startTime", now] },
                          { $gte: ["$deadline", now] },
                        ],
                      },
                      "In Progress",
                      { $cond: [{ $lt: ["$deadline", now] }, "Overdue", "Assigned"] },
                    ],
                  },
                },
              ],
              default: "$status",
            },
          },
        },
      },
      // Subject and free-text search narrow everything, tiles included.
      ...(Object.keys(scope).length ? [{ $match: scope }] : []),
      { $sort: { startTime: -1, createdAt: -1 } },
      {
        $facet: {
          // The status pills filter the list, not the tiles, so they apply here
          // and not to statusCounts below.
          total: [...(statusFilter ? [{ $match: statusFilter }] : []), { $count: "n" }],
          // Counted over every assignment this filter matches, not just the
          // page. The browser used to tally the nine rows it had been sent, so
          // the totals changed every time the student turned the page.
          statusCounts: [{ $group: { _id: "$effectiveStatus", n: { $sum: 1 } } }],
          // The cumulative average, over every completed assignment rather
          // than the fifty the dashboard happens to request. Computed from the
          // same stages the cards use, so the tile and the plotted points can
          // never disagree; the lookup runs only over completed rows.
          scoreSummary: [
            { $match: { status: "Completed" } },
            ...withScore,
            { $match: { scorePercent: { $ne: null } } },
            { $group: { _id: null, average: { $avg: "$scorePercent" }, graded: { $sum: 1 } } },
          ],
          page: [
            ...(statusFilter ? [{ $match: statusFilter }] : []),
            { $skip: skip },
            { $limit: limit },
            // The marks a student actually scored, as a percentage.
            //
            // `Assignment.score` is null on every completed assignment in the
            // database -- nothing populates it -- and `autoScore` holds raw
            // marks with no denominator beside them, so 34 could be 38% or 97%.
            ...withScore,
            {
              $project: {
                testId: 1, mentorId: 1, status: 1, startTime: 1, duration: 1,
                deadline: 1, startedAt: 1, completedAt: 1, score: 1, autoScore: 1,
                mentorScore: 1, mentorFeedback: 1, reviewStatus: 1, timeSpent: 1,
                createdAt: 1, totalScore: 1, maxScore: 1, scorePercent: 1,
                // What the card badge shows. Sent so a client grouping by
                // status reaches the same answer as the summary counts above.
                effectiveStatus: 1,
              },
            },
          ],
        },
      },
    ]);

    const assignments = result?.page || [];
    const validCount = result?.total?.[0]?.n || 0;

    // Scheduled tests move to "In Progress" on their own once their window
    // opens. The write is deliberately not awaited: the response does not
    // depend on it, it is idempotent, and the next page load repeats it if it
    // failed -- so it must not cost the student another round trip's wait.
    //
    // Finishing an expired attempt is NOT done here. That belongs to
    // services/expiredAttempts, which grades the answers the student actually
    // saved. This route used to do its own version, marking the attempt
    // Completed with a hard-coded autoScore of 0 after a 30-second buffer --
    // far inside the five-minute grace the submit route honours, and blind to
    // the student's own countdown. A student who merely opened this page while
    // their exam was still running could be zeroed by it.
    const toAutoStart = assignments.filter(
      (a) =>
        a.status === "Assigned" &&
        a.duration === a.testId.timeLimit &&
        now >= new Date(a.startTime) &&
        now <= new Date(a.deadline)
    );

    if (toAutoStart.length > 0) {
      toAutoStart.forEach((a) => {
        a.status = "In Progress";
        a.startedAt = now;
      });
      Assignment.updateMany(
        { _id: { $in: toAutoStart.map((a) => a._id) }, status: "Assigned" },
        { $set: { status: "In Progress", startedAt: now } }
      ).catch((error) => console.error("Auto-start failed:", error.message));
    }

    const totalPages = Math.ceil(validCount / limit) || 1;

    const byStatus = Object.fromEntries((result?.statusCounts || []).map((s) => [s._id, s.n]));
    const summary = result?.scoreSummary?.[0];
    const stats = {
      assigned: byStatus["Assigned"] || 0,
      inProgress: byStatus["In Progress"] || 0,
      completed: byStatus["Completed"] || 0,
      overdue: byStatus["Overdue"] || 0,
      total: validCount,
      // Averaged over every completed assignment, so the figure does not depend
      // on how many rows the caller asked for. null when nothing has been
      // graded yet, which is not the same as having scored zero.
      averagePercent: summary ? Math.round(summary.average) : null,
      gradedCount: summary?.graded || 0,
    };

    res.json({
      assignments,
      stats,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems: validCount,
        itemsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Get assignment statistics for current student (counts only - ULTRA FAST)
router.get("/student/stats", authenticateToken, async (req, res, next) => {
  try {
    if (req.user.role !== "Student") {
      return res.status(403).json({ message: "Access denied. Student access only." });
    }

    // Disable ETag for this route to prevent 304 delays
    res.set('ETag', false);
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    const startTime = Date.now();

    // Get test IDs from cache or database (exclude practice tests only - match main endpoint logic)
    // NOTE: Don't filter by test status here - assignments can exist for any test status
    const cacheKey = 'tests_all';
    let validTestIds = getCachedTestIds(cacheKey);

    if (!validTestIds) {
      const validTests = await Test.find({ type: { $ne: "practice" } }).select('_id').lean();
      validTestIds = validTests.map(t => t._id);
      setCachedTestIds(cacheKey, validTestIds);
    }

    // Count assignments in parallel - ULTRA FAST
    const [assignedCount, completedCount] = await Promise.all([
      // Assigned: Total assigned tests (active + completed + overdue)
      Assignment.countDocuments({
        userId: req.user.userId,
        testId: { $in: validTestIds }
      }),
      // Completed: status is "Completed" AND completedAt exists (actually submitted)
      Assignment.countDocuments({
        userId: req.user.userId,
        testId: { $in: validTestIds },
        status: "Completed",
        completedAt: { $exists: true, $ne: null }
      })
    ]);

    const totalTime = Date.now() - startTime;
    console.log(`✅ Stats fetched in ${totalTime}ms - Assigned: ${assignedCount}, Completed: ${completedCount}`);

    res.json({
      assignedCount,
      completedCount
    });
  } catch (error) {
    console.error('❌ Error fetching assignment stats:', error);
    next(error);
  }
});

// Get recent activity for current student - ULTRA FAST VERSION
router.get("/student/recent-activity", authenticateToken, async (req, res, next) => {
  try {
    if (req.user.role !== "Student") {
      return res.status(403).json({ message: "Access denied. Student access only." });
    }

    const startTime = Date.now();
    const userId = req.user.userId;
    // console.log('🚀 ULTRA FAST: Fetching recent activity for student:', userId);
    const activities = [];

    // ULTRA FAST: Get only recent assignments with limit to reduce data processing
    const assignments = await Assignment.find({ userId })
      .select("testId status completedAt startedAt createdAt")
      .populate("testId", "title")
      .sort({ createdAt: -1 })
      .limit(20) // Limit to recent 20 assignments only
      .lean(); // Use lean() for 2x faster queries

    // Process assignments into activities
    const completedTests = assignments.filter(a => a.status === "Completed").slice(0, 3);
    const startedTests = assignments.filter(a => a.status === "In Progress" && a.startedAt).slice(0, 2);
    const assignedTests = assignments.filter(a => a.status === "Assigned").slice(0, 2);

    // Add completed tests to activities
    completedTests.forEach(test => {
      activities.push({
        type: "completed",
        testId: test.testId,
        testTitle: test.testId.title,
        timestamp: test.completedAt || test.createdAt,
        message: `Completed test: ${test.testId.title}`
      });
    });

    // Add started tests to activities
    startedTests.forEach(test => {
      activities.push({
        type: "started",
        testId: test.testId,
        testTitle: test.testId.title,
        timestamp: test.startedAt,
        message: `Started test: ${test.testId.title}`
      });
    });

    // Add assigned tests to activities
    assignedTests.forEach(test => {
      activities.push({
        type: "assigned",
        testId: test.testId,
        testTitle: test.testId.title,
        timestamp: test.createdAt,
        message: `Assigned test: ${test.testId.title}`
      });
    });

    // Sort all activities by timestamp (most recent first)
    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Return only the most recent 7 activities
    const recentActivities = activities.slice(0, 7);

    const totalTime = Date.now() - startTime;
    console.log(`✅ ULTRA FAST student recent activity completed in ${totalTime}ms - Found ${recentActivities.length} activities`);

    // Optimize response - ensure clean JSON structure
    const optimizedActivities = recentActivities.map(activity => ({
      type: activity.type,
      testId: activity.testId?._id || activity.testId,
      testTitle: activity.testTitle,
      timestamp: activity.timestamp,
      message: activity.message
    }));

    res.json(optimizedActivities);
  } catch (error) {
    next(error);
  }
});

// Get assignment by ID
// The cohorts a test can be assigned to, with live student counts (admin only).
router.get("/cohorts", authenticateToken, requireRole("admin"), async (req, res, next) => {
  try {
    res.json({ cohorts: await cohortCounts() });
  } catch (error) {
    next(error);
  }
});

// Assign test to specific students manually (admin only)

router.get("/:id", authenticateToken, attachProctorStatus(), async (req, res, next) => {
  try {
    // NOTE: `questions` is an embedded array on Test, not a reference, so the
    // nested populate that used to be here did nothing at all — its `select`
    // was silently ignored and the full question documents came through with
    // every answer, model answer and hidden test case attached. Sanitising is
    // done explicitly below instead, on a plain object.
    const assignment = await Assignment.findById(req.params.id)
      .populate({
        path: "testId",
        select: "title type instructions timeLimit allowedTabSwitches shuffleQuestions questions",
      })
      .populate("mentorId", "name email")
      .lean();

    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found" });
    }

    await attach(assignment, "userId", "Student");

    // Check if user has access to this assignment.
    //
    // The role comparison is case-insensitive because roles are stored
    // capitalised ("Admin", "Student"), so the old `!== "admin"` could never be
    // false and an admin was refused their own students' assignments here --
    // while the very next lines already treat admins as privileged when
    // deciding whether to strip the answers.
    const isPrivileged = String(req.user.role || "").toLowerCase() === "admin";
    if (!isPrivileged && assignment.userId && assignment.userId._id && assignment.userId._id.toString() !== req.user.userId) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Everything from here works on a plain object. Re-assigning stripped
    // questions onto the Mongoose document casts them straight back into full
    // subdocuments, which is how the previous version leaked every answer while
    // looking like it was removing them.
    const payload = assignment.toObject ? assignment.toObject() : { ...assignment };

    if (payload.testId && Array.isArray(payload.testId.questions) && !canSeeAnswers(req.user)) {
      payload.testId.questions = sanitizeQuestions(payload.testId.questions);
      // This is the reload/resume path, so it has to return the order this
      // student already had -- reshuffling a paper under someone mid-exam would
      // scramble which question they thought they were on.
      await applyStudentQuestionOrder(payload.testId, assignment);
    }

    // The student's own permutation never goes out with the payload — see
    // forStudent() for why.
    if (!canSeeAnswers(req.user)) delete payload.questionOrder;

    // Same rule as POST /:id/start: once the attempt is over, the questions
    // stop. This is the route the exam page resumes through, so without it a
    // student could reopen an expired paper and carry on typing into it.
    //
    // "Over" covers a finished attempt as well as an expired one. The sweep
    // that finalises abandoned attempts flips them to Completed, and a check
    // that only looked at "In Progress" handed the paper back out again the
    // moment it did. Review happens through /test-submissions/assignment/:id,
    // which is where a finished paper is supposed to be read.
    const attemptOver =
      payload.status === "Completed" ||
      (payload.status === "In Progress" && isAttemptExpired(payload, payload.testId));

    if (!canSeeAnswers(req.user) && attemptOver && payload.testId) {
      payload.testId.questions = [];
      payload.expired = true;
      return res.status(200).json(payload);
    }

    // This route is called before the exam begins, to show the title, the
    // instructions and the timing, so it must keep working without proctoring.
    // The question content is the part that is withheld until a proctoring
    // session is actually running — otherwise the questions could simply be
    // fetched with a direct API call and answered offline.
    if (!mayServeQuestions(req) && payload.testId) {
      payload.testId.questions = [];
      payload.proctoringRequired = true;
      return res.json(payload);
    }

    return res.json(payload);
  } catch (error) {
    next(error);
  }
});

router.get("/check-expiration/:id", authenticateToken, async (req, res, next) => {
  try {
    const assignment = await Assignment.findById(req.params.id)
      .populate("testId", "timeLimit");

    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found" });
    }

    const now = new Date();

    // Check availability window (assignment duration)
    let endTime = assignment.deadline;
    if (!endTime) {
      endTime = new Date(assignment.startTime);
      endTime.setMinutes(endTime.getMinutes() + assignment.duration);
    }
    // Add buffer to avoid timing issues
    const endTimeWithBuffer = new Date(endTime.getTime() + 5000);

    if (now > endTimeWithBuffer) {
      return res.status(400).json({
        message: "Test availability window has expired.",
        // A stable code, because the exam page keys its auto-submit backstop off
        // this reply. It used to match on the message text -- and matched the
        // wrong string, so the backstop never once fired.
        code: "attempt_expired",
      });
    }

    // Check test time limit if test has started
    if (assignment.startedAt && assignment.testId?.timeLimit) {
      const testEndTime = new Date(assignment.startedAt.getTime() + assignment.testId.timeLimit * 60000);
      const testEndTimeWithBuffer = new Date(testEndTime.getTime() + 5000);

      if (now > testEndTimeWithBuffer) {
        return res.status(400).json({ message: "Test time limit has expired.", code: "attempt_expired" });
      }
    }

    res.status(200).json({ message: "Test is still active." });
  } catch (error) {
    next(error);
  }
});

// Create assignment (admin only)
router.post("/", authenticateToken, requireRole("admin"), async (req, res, next) => {
  try {
    const { testId, userId, startTime, duration, mentorId } = req.body;

    if (!testId || !userId || !startTime || !duration) {
      return res.status(400).json({ message: "testId, userId, startTime, and duration are required" });
    }

    // Get test to validate timeLimit
    const test = await Test.findById(testId);
    if (!test) {
      return res.status(404).json({ message: "Test not found" });
    }

    // Validate duration >= timeLimit
    if (Number(duration) < test.timeLimit) {
      return res.status(400).json({
        message: `Duration (${duration} minutes) must be greater than or equal to test time limit (${test.timeLimit} minutes)`
      });
    }

    // Check if assignment already exists
    const existingAssignment = await Assignment.findOne({ testId, userId });
    if (existingAssignment) {
      return res.status(400).json({ message: "Assignment already exists for this user and test" });
    }

    const assignment = await Assignment.create({
      testId,
      userId,
      mentorId: mentorId || null,
      startTime: new Date(startTime),
      duration: Number(duration),
      status: "Assigned"
    });

    // Explicitly calculate and save deadline
    const deadline = new Date(assignment.startTime);
    deadline.setMinutes(deadline.getMinutes() + assignment.duration);
    assignment.deadline = deadline;
    await assignment.save();

    // Update test status from "Draft" to "Active" when assigned to students
    // Refetch test to ensure we have the latest status
    const updatedTest = await Test.findById(testId);
    if (updatedTest && updatedTest.status === "Draft") {
      updatedTest.status = "Active";
      await updatedTest.save();
    }

    const populatedAssignment = await attach(
      await Assignment.findById(assignment._id)
        .populate("testId", "title type instructions timeLimit subject")
        .populate("mentorId", "name email")
        .lean(),
      "userId",
      "Student"
    );

    // Emit real-time update to specific student
    const io = req.app.get('io');
    // console.log(`Emitting assignmentCreated to user ${userId}`);
    io.to(userId.toString()).emit('assignmentCreated', {
      userId: userId,
      assignment: populatedAssignment
    });

    // Invalidate test cache so students see the newly assigned test immediately
    // This is critical for immediate visibility
    invalidateTestCache();
    console.log('🗑️ Test cache invalidated after assignment creation');

    res.status(201).json(populatedAssignment);
  } catch (error) {
    next(error);
  }
});

router.post("/:id/start", authenticateToken, attachProctorStatus(), async (req, res, next) => {
  try {
    const { permissions } = req.body;

    const assignment = await Assignment.findById(req.params.id)
      .populate({
        path: "testId",
        select: "title type instructions timeLimit allowedTabSwitches shuffleQuestions questions",
      });

    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found" });
    }

    // Check if user owns this assignment
    if (assignment.userId.toString() !== req.user.userId) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Check if already completed
    if (assignment.status === "Completed") {
      return res.status(400).json({ message: "Test already completed" });
    }

    // An attempt whose time has gone is not re-openable.
    //
    // Pressing Start flips the assignment to "In Progress" before the student
    // has granted a single permission, so an attempt abandoned at the
    // permissions screen sat there half-open indefinitely -- and the exam page
    // would still load it days later, long past the deadline, with a timer
    // reading zero. They could not submit it (the submit route has always
    // checked), which left them typing into a paper that could never be handed
    // in. The questions stop being served at the same moment the submit window
    // closes.
    if (assignment.status === "In Progress" && isAttemptExpired(assignment, assignment.testId)) {
      return res.status(400).json({
        message: "This test's time has expired. Your answers have been submitted for review.",
        code: "attempt_expired",
        expired: true,
      });
    }

    // Check if already in progress - return 200 with special flag instead of 400
    if (assignment.status === "In Progress") {
      // Calculate remaining time
      const now = new Date();
      let timeRemaining = 0;

      if (assignment.startedAt && assignment.testId?.timeLimit) {
        const testEndTime = new Date(assignment.startedAt.getTime() + assignment.testId.timeLimit * 60000);
        const remainingMs = testEndTime.getTime() - now.getTime();
        timeRemaining = Math.max(0, Math.floor(remainingMs / 1000)); // Convert to seconds
      }

      // Strip answers before sending to the student.
      //
      // This used to hand-strip `answer`/`answers` by assigning plain objects
      // back onto the populated Mongoose document -- which re-casts them into
      // full subdocuments, so nothing was stripped at all -- and never targeted
      // `expectedAnswer` or `hiddenTestCases` in the first place. Both are the
      // bugs commit 6d76e1c fixed on the other routes and missed on this one.
      // Work on a plain object and use the shared sanitizer, like everywhere else.
      const testData = toPlain(assignment.testId);
      if (testData && Array.isArray(testData.questions) && !canSeeAnswers(req.user)) {
        testData.questions = sanitizeQuestions(testData.questions);
        await applyStudentQuestionOrder(testData, assignment);
      }

      // Withheld until proctoring is live — see the note on GET /:id.
      if (!mayServeQuestions(req) && testData) {
        testData.questions = [];
      }

      return res.status(200).json({
        assignment: forStudent(assignment, req.user, testData),
        test: testData,
        message: "Test already started",
        alreadyStarted: true,
        timeRemaining,
        proctoringRequired: !mayServeQuestions(req)
      });
    }

    // Check if test is within the allowed time window
    const now = new Date();
    const startTime = new Date(assignment.startTime);
    const endTime = new Date(startTime.getTime() + assignment.duration * 60000); // Convert minutes to milliseconds

    if (now < startTime) {
      return res.status(400).json({ message: "Test is not available yet. It will start at " + startTime.toLocaleString() });
    }

    if (now > endTime) {
      assignment.status = "Overdue";
      await assignment.save();
      return res.status(400).json({ message: "Test deadline has passed. The test was available until " + endTime.toLocaleString() });
    }

    // Handle permissions (skip for coding tests)
    let permissionStatus = "Pending";
    let hasAllPermissionsGranted = false;
    const isCodingTest = assignment.testId?.type === "coding";

    if (!isCodingTest && permissions) {
      const cameraGranted = permissions.cameraGranted || permissions.camera === "granted";
      const microphoneGranted = permissions.microphoneGranted || permissions.microphone === "granted";
      const locationGranted = permissions.locationGranted || permissions.location === "granted";

      // Determine permission status
      if (cameraGranted && microphoneGranted && locationGranted) {
        permissionStatus = "Granted";
        hasAllPermissionsGranted = true;
      } else if (cameraGranted || microphoneGranted || locationGranted) {
        permissionStatus = "Partially Granted";
      } else {
        permissionStatus = "Denied";
      }

      // Store permissions in assignment
      assignment.permissions = {
        cameraGranted,
        microphoneGranted,
        locationGranted,
        permissionRequestedAt: new Date(),
        permissionStatus
      };
    }

    // Store timeLimit before saving (populated testId might be lost after save)
    let timeLimitMinutes = assignment.testId?.timeLimit;

    console.log('🔍 Initial timeLimit check:', {
      timeLimitMinutes,
      testIdType: typeof assignment.testId,
      testIdIsObject: assignment.testId && typeof assignment.testId === 'object',
      testIdId: assignment.testId?._id,
      testIdTimeLimit: assignment.testId?.timeLimit
    });

    // If timeLimit is missing, try to get it from the test directly
    if (!timeLimitMinutes || timeLimitMinutes <= 0 || isNaN(timeLimitMinutes)) {
      console.warn('⚠️ timeLimit missing or invalid, fetching test directly');
      const testIdToFetch = assignment.testId?._id || assignment.testId;
      if (testIdToFetch) {
        const test = await Test.findById(testIdToFetch);
        if (test && test.timeLimit) {
          timeLimitMinutes = Number(test.timeLimit);
          console.log('✅ Fetched timeLimit from test:', timeLimitMinutes);
        }
      }
    }

    // Ensure it's a valid number
    timeLimitMinutes = Number(timeLimitMinutes);

    if (!timeLimitMinutes || timeLimitMinutes <= 0 || isNaN(timeLimitMinutes)) {
      console.error('❌ ERROR: timeLimit is missing or invalid:', {
        timeLimitMinutes,
        testId: assignment.testId?._id || assignment.testId,
        testIdType: typeof assignment.testId,
        testIdValue: assignment.testId
      });
      // Use a default of 30 minutes if timeLimit is missing
      timeLimitMinutes = 30;
      console.warn('⚠️ Using default timeLimit of 30 minutes');
    }

    console.log('✅ Final timeLimitMinutes:', timeLimitMinutes);

    // Start the test
    assignment.status = "In Progress";
    const startedAt = new Date();
    assignment.startedAt = startedAt;

    // Explicitly calculate and save deadline if not set
    if (!assignment.deadline) {
      const deadline = new Date(assignment.startTime);
      deadline.setMinutes(deadline.getMinutes() + assignment.duration);
      assignment.deadline = deadline;
    }

    await assignment.save();

    // Calculate remaining time in seconds
    // Use the stored timeLimitMinutes and startedAt
    const startedAtTime = startedAt.getTime();
    const testEndTime = startedAtTime + (timeLimitMinutes * 60000); // timeLimit in minutes, convert to ms
    const nowTimestamp = Date.now();
    const remainingMs = testEndTime - nowTimestamp;
    const timeRemaining = Math.max(0, Math.floor(remainingMs / 1000)); // Convert to seconds

    console.log('⏰ Time calculation:', {
      timeLimitMinutes,
      startedAt: startedAt.toISOString(),
      startedAtTime,
      testEndTime,
      nowTimestamp,
      remainingMs,
      timeRemaining,
      'testEndTime - nowTimestamp (ms)': remainingMs,
      'timeRemaining (seconds)': timeRemaining,
      'timeRemaining (minutes)': Math.floor(timeRemaining / 60)
    });

    // Ensure testId is populated in response (without answers for students)
    const populatedAssignment = await Assignment.findById(assignment._id)
      .populate({
        path: "testId",
        select: "title type instructions timeLimit allowedTabSwitches shuffleQuestions questions",
      });

    // Strip answers before sending to the student -- see the note in the
    // already-in-progress branch above for what was wrong with the version
    // this replaces.
    const testData = toPlain(populatedAssignment.testId || assignment.testId);
    if (testData && Array.isArray(testData.questions) && !canSeeAnswers(req.user)) {
      testData.questions = sanitizeQuestions(testData.questions);
      await applyStudentQuestionOrder(testData, populatedAssignment);
    }

    // The dashboard's Start Test button calls this route before the exam page
    // has mounted, so it must succeed without proctoring. Only the questions
    // wait for a live proctoring session.
    if (!mayServeQuestions(req) && testData) {
      testData.questions = [];
    }

    res.json({
      assignment: forStudent(populatedAssignment, req.user, testData),
      test: testData,
      message: "Test started successfully",
      timeRemaining: timeRemaining,
      proctoringRequired: !mayServeQuestions(req)
    });
  } catch (error) {
    next(error);
  }
});

// Update assignment (admin only)
router.put("/:id", authenticateToken, requireRole("admin"), async (req, res, next) => {
  try {
    const { mentorId, deadline, status } = req.body;

    const updateData = {};
    if (mentorId !== undefined) updateData.mentorId = mentorId;
    if (deadline) updateData.deadline = new Date(deadline);
    if (status) updateData.status = status;

    const assignment = await Assignment.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    )
      .populate("testId", "title type instructions timeLimit")
      .populate("mentorId", "name email")
      .lean();

    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found" });
    }

    res.json(await attach(assignment, "userId", "Student"));
  } catch (error) {
    next(error);
  }
});

// Assign a test to a whole cohort (admin only).
//
// This replaces the old /assign-all, /assign-ru and /assign-su routes, which
// were three near-identical copies of the same 190 lines differing only in which
// students they selected. The cohort list lives in services/principals, so a new
// campus needs one entry there and nothing here.
router.post("/assign-cohort", authenticateToken, requireRole("admin"), async (req, res, next) => {
  try {
    const { testId, startTime, duration, mentorId, cohort } = req.body;

    if (!testId || !startTime || !duration || !cohort) {
      return res.status(400).json({ message: "testId, startTime, duration and cohort are required" });
    }

    const cohortDef = getCohort(cohort);
    if (!cohortDef) {
      return res.status(400).json({
        message: `Unknown cohort "${cohort}". Expected one of: ${COHORTS.map((c) => c.key).join(", ")}`
      });
    }

    const test = await Test.findById(testId);
    if (!test) {
      return res.status(404).json({ message: "Test not found" });
    }

    if (Number(duration) < test.timeLimit) {
      return res.status(400).json({
        message: `Duration (${duration} minutes) must be greater than or equal to test time limit (${test.timeLimit} minutes)`
      });
    }

    const students = await findStudentsByCohort(cohort);
    if (!students.length) {
      return res.status(404).json({ message: `No students found in ${cohortDef.label}` });
    }

    // Skip students who already hold this assignment, so re-assigning a cohort
    // tops it up rather than failing on the unique {testId, userId} index.
    const existingAssignments = await Assignment.find({ testId }).select("userId").lean();
    const existingUserIds = new Set(existingAssignments.map((a) => String(a.userId)));

    const startTimeDate = new Date(startTime);
    const deadline = new Date(startTimeDate);
    deadline.setMinutes(deadline.getMinutes() + Number(duration));

    const assignmentsToInsert = [];
    const studentIdsForSocket = [];

    for (const student of students) {
      const studentIdStr = String(student._id);
      if (!existingUserIds.has(studentIdStr)) {
        assignmentsToInsert.push({
          testId,
          userId: student._id,
          mentorId: mentorId || null,
          startTime: startTimeDate,
          duration: Number(duration),
          deadline,
          status: "Assigned"
        });
        studentIdsForSocket.push(studentIdStr);
      }
    }

    let created = 0;
    const BATCH_SIZE = 100;
    for (let i = 0; i < assignmentsToInsert.length; i += BATCH_SIZE) {
      const batch = assignmentsToInsert.slice(i, i + BATCH_SIZE);
      const inserted = await Assignment.insertMany(batch, { ordered: false });
      created += inserted.length;
    }

    // A test goes live the moment it is assigned to anyone.
    const updatedTest = await Test.findById(testId);
    if (updatedTest && updatedTest.status === "Draft") {
      updatedTest.status = "Active";
      await updatedTest.save();
    }

    if (created === 0) {
      return res.status(200).json({
        message: `Every student in ${cohortDef.label} already has this assignment`,
        cohort: cohortDef.key,
        cohortLabel: cohortDef.label,
        totalInCohort: students.length,
        assignedCount: 0
      });
    }

    // Tell each student's open tab, in batches so a large cohort does not
    // flood socket.io in one go.
    try {
      const io = req.app.get("io");
      if (io && studentIdsForSocket.length) {
        const SOCKET_BATCH_SIZE = 50;
        for (let i = 0; i < studentIdsForSocket.length; i += SOCKET_BATCH_SIZE) {
          studentIdsForSocket.slice(i, i + SOCKET_BATCH_SIZE).forEach((userId) => {
            try {
              io.to(userId).emit("assignmentCreated", { userId, testId });
            } catch (emitError) {
              console.error(`Error emitting to user ${userId}:`, emitError);
            }
          });
          if (i + SOCKET_BATCH_SIZE < studentIdsForSocket.length) {
            await new Promise((resolve) => setTimeout(resolve, 10));
          }
        }
      }
    } catch (socketError) {
      // A socket failure must not undo a successful assignment.
      console.error("Error emitting assignment events:", socketError);
    }

    invalidateTestCache();

    res.status(201).json({
      message: `Successfully assigned to ${created} student${created === 1 ? "" : "s"} in ${cohortDef.label}`,
      cohort: cohortDef.key,
      cohortLabel: cohortDef.label,
      totalInCohort: students.length,
      assignedCount: created
    });
  } catch (error) {
    if (!res.headersSent) next(error);
    else console.error("Error in /assign-cohort after response sent:", error);
  }
});

router.post("/assign-manual", authenticateToken, requireRole("admin"), async (req, res, next) => {
  try {
    const { testId, studentIds, startTime, duration, mentorId } = req.body;

    if (!testId || !studentIds || !startTime || !duration) {
      return res.status(400).json({
        message: "testId, studentIds, startTime, and duration are required"
      });
    }

    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({
        message: "studentIds must be a non-empty array"
      });
    }

    // Get test to validate timeLimit
    const test = await Test.findById(testId);
    if (!test) {
      return res.status(404).json({ message: "Test not found" });
    }

    // Validate duration >= timeLimit
    if (Number(duration) < test.timeLimit) {
      return res.status(400).json({
        message: `Duration (${duration} minutes) must be greater than or equal to test time limit (${test.timeLimit} minutes)`
      });
    }

    // Validate that all student IDs are valid and correspond to actual students
    const students = await Student.find({ _id: { $in: studentIds } })
      .select("_id")
      .lean();

    if (students.length !== studentIds.length) {
      const validStudentIds = students.map(student => student._id.toString());
      const invalidStudentIds = studentIds.filter(id => !validStudentIds.includes(id));

      return res.status(400).json({
        message: "Some student IDs are invalid or not students",
        invalidStudentIds
      });
    }

    // Create assignments for selected students - OPTIMIZED with bulk operations
    const existingAssignments = await Assignment.find({
      testId,
      userId: { $in: studentIds }
    }).select("userId").lean();

    const existingUserIds = new Set(existingAssignments.map(a => a.userId.toString()));

    // Calculate deadline once
    const startTimeDate = new Date(startTime);
    const deadline = new Date(startTimeDate);
    deadline.setMinutes(deadline.getMinutes() + Number(duration));

    // Prepare bulk operations for new assignments
    const assignmentsToInsert = [];
    const studentIdsForSocket = [];

    for (const studentId of studentIds) {
      if (!existingUserIds.has(studentId)) {
        assignmentsToInsert.push({
          testId,
          userId: studentId,
          mentorId: mentorId || null,
          startTime: startTimeDate,
          duration: Number(duration),
          deadline: deadline,
          status: "Assigned"
        });
        studentIdsForSocket.push(studentId);
      }
    }

    let assignments = [];
    if (assignmentsToInsert.length > 0) {
      // Use bulk insert for better performance
      const insertedAssignments = await Assignment.insertMany(assignmentsToInsert, { ordered: false });
      assignments = insertedAssignments;
    }

    // Update test status from "Draft" to "Active" when assigned to students
    // Refetch test to ensure we have the latest status
    const updatedTest = await Test.findById(testId);
    if (updatedTest && updatedTest.status === "Draft") {
      updatedTest.status = "Active";
      await updatedTest.save();
    }

    if (assignments.length === 0) {
      return res.status(200).json({
        message: "All selected students already have this assignment",
        assignedCount: 0
      });
    }

    // Emit real-time update to specific student for each assignment - optimized for large numbers
    const io = req.app.get('io');
    if (io && studentIdsForSocket.length > 0) {
      // Emit in batches to avoid overwhelming socket.io
      const SOCKET_BATCH_SIZE = 50;
      for (let i = 0; i < studentIdsForSocket.length; i += SOCKET_BATCH_SIZE) {
        const batch = studentIdsForSocket.slice(i, i + SOCKET_BATCH_SIZE);
        batch.forEach(userId => {
          try {
            io.to(userId).emit('assignmentCreated', {
              userId: userId,
              testId: testId
            });
          } catch (emitError) {
            console.error(`Error emitting to user ${userId}:`, emitError);
          }
        });
        // Small delay between batches
        if (i + SOCKET_BATCH_SIZE < studentIdsForSocket.length) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }
    }

    // Invalidate test cache so students see the newly assigned test immediately
    // This is critical for immediate visibility
    invalidateTestCache();
    console.log('🗑️ Test cache invalidated after assignment creation');

    res.status(201).json({
      message: `Successfully assigned to ${assignments.length} students`,
      assignedCount: assignments.length
    });
  } catch (error) {
    next(error);
  }
});
// Get available mentors (admin only)
router.get("/mentors/available", authenticateToken, requireRole("admin"), async (req, res, next) => {
  try {
    const mentors = await Mentor.find({})
      .select("name email")
      .sort({ name: 1 })
      .lean();

    res.json(mentors);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
