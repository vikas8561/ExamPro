const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const Student = require("../models/Student");
const Mentor = require("../models/Mentor");
const Admin = require("../models/Admin");
const Profile = require("../models/Profile");
const Subject = require("../models/Subject");
const AuthSession = require("../models/AuthSession");
const { authenticateToken, requireRole } = require("../middleware/auth");
const { normalizeStudent, getCohort, cohortCounts, STUDENT_FIELDS } = require("../services/principals");
const { isDatabaseUnavailable } = require("../utils/databaseErrors");
const lockout = require("../services/loginLockout");

// The admin panel lists everyone who can sign in. Those identities come from
// three collections across two databases now - students from the university's
// `students`, mentors and admins from ExamPro's own - so the listing is
// assembled here rather than by a single query. Students are all but read-only:
// the university owns them, so they cannot be created, edited or deleted here.
// The one exception is the password reset below, which an admin needs in order to
// let a student who has forgotten theirs back in.

const STUDENTS_ARE_READ_ONLY =
  "Students are managed in the university's system and cannot be created, edited or deleted from ExamPro.";

// What an admin resets a locked-out student's password to. The student signs in
// with this and is expected to change it themselves afterwards.
const DEFAULT_STUDENT_PASSWORD = "123456";

// Every identifier this student could have typed at the login form. The lockout
// counter is keyed by what was typed rather than by whose account it was, so
// reading or clearing a student's lock means covering all of them.
function studentLoginKeys(student) {
  return [student.universityUID, student.rollno, student.email].filter(Boolean);
}

// Find a student by id, normalized. The counterpart to findStaff() below, which
// deliberately returns null for a student id.
async function findStudent(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  const doc = await Student.findById(id).select(STUDENT_FIELDS).lean();
  return doc ? normalizeStudent(doc) : null;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Load everyone into one normalized list. Mentors and admins number in the
// dozens and students in the hundreds, so this stays comfortably in memory and
// avoids trying to paginate across two databases.
// `filter` is either empty / "All Users", the role names "Mentor" or "Admin",
// or "students:<cohortKey>" for one of the campus cohorts in services/principals.
async function loadDirectory({ search = "", filter = "" } = {}) {
  const showEveryone = !filter || filter === "All Users";
  const cohortKey = filter.startsWith("students:") ? filter.slice("students:".length) : null;

  const wantsStudents = showEveryone || cohortKey !== null;
  const wantsMentors = showEveryone || filter === "Mentor";
  const wantsAdmins = showEveryone || filter === "Admin";

  const studentQuery = {};
  if (cohortKey) {
    const cohort = getCohort(cohortKey);
    // An unrecognised cohort key must not silently widen to every student.
    if (!cohort) return [];
    Object.assign(studentQuery, cohort.filter);
  }
  if (search) {
    const rx = new RegExp(escapeRegex(search), "i");
    // Students are found by the things they actually sign in with as well.
    studentQuery.$or = [
      { studentName: rx },
      { studentEmail: rx },
      { rollno: rx },
      { UniversityUID: rx },
    ];
  }

  const staffQuery = search
    ? { $or: [{ name: new RegExp(escapeRegex(search), "i") }, { email: new RegExp(escapeRegex(search), "i") }] }
    : {};

  const [students, mentors, admins] = await Promise.all([
    wantsStudents
      ? Student.find(studentQuery).select(`${STUDENT_FIELDS} createdAt`).lean()
      : [],
    wantsMentors
      ? Mentor.find(staffQuery).select("name email subjects createdAt updatedAt").populate("subjects", "name").lean()
      : [],
    wantsAdmins ? Admin.find(staffQuery).select("name email createdAt updatedAt").lean() : [],
  ]);

  return [
    // Students carry their login-lockout state, so the admin panel can show who
    // is locked out and offer to unblock them. It is read from memory, so this
    // costs nothing per row.
    ...students.map((doc) => {
      const row = normalizeStudent(doc);
      return { ...row, createdAt: doc.createdAt, ...lockout.statusFor(studentLoginKeys(row)) };
    }),
    ...mentors.map((doc) => ({
      _id: doc._id,
      name: doc.name,
      email: doc.email,
      role: "Mentor",
      subjects: doc.subjects || [],
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    })),
    ...admins.map((doc) => ({
      _id: doc._id,
      name: doc.name,
      email: doc.email,
      role: "Admin",
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    })),
  ];
}

// Attach the saved profile-photo flag the admin panel sorts and filters on.
async function withProfileFlags(rows) {
  const ids = rows.map((r) => String(r._id));
  const profiles = await Profile.find({ principalId: { $in: ids } })
    .select("principalId profileImageSaved")
    .lean();
  const saved = new Map(profiles.map((p) => [p.principalId, !!p.profileImageSaved]));
  return rows.map((r) => ({ ...r, profileImageSaved: saved.get(String(r._id)) || false }));
}

// Find a mentor or admin by id. Returns null for a student id, since students
// are not editable here.
async function findStaff(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  const mentor = await Mentor.findById(id);
  if (mentor) return { doc: mentor, role: "Mentor" };
  const admin = await Admin.findById(id);
  if (admin) return { doc: admin, role: "Admin" };
  return null;
}

// The filter options the admin directory offers: every campus cohort, plus the
// two staff roles. Same cohort list the assignment modes use.
router.get("/filters", authenticateToken, requireRole("Admin"), async (req, res) => {
  try {
    const cohorts = await cohortCounts();
    res.json({
      filters: [
        { value: "All Users", label: "All Users" },
        ...cohorts.map((c) => ({
          value: `students:${c.key}`,
          label: c.key === "all" ? "All Students" : c.label,
          count: c.count,
        })),
        { value: "Mentor", label: "Mentors" },
        { value: "Admin", label: "Admins" },
      ],
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get all users (admin only)
router.get("/", authenticateToken, requireRole("Admin"), async (req, res) => {
  try {
    const rows = await loadDirectory();
    rows.sort((a, b) => a.name.localeCompare(b.name));
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get all users with profile details (admin only) - with pagination and search
router.get("/profiles", authenticateToken, requireRole("Admin"), async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 9;
    const skip = (page - 1) * limit;

    const rows = await withProfileFlags(
      await loadDirectory({ search: req.query.search || "", filter: req.query.filter || "" })
    );

    // Same ordering the aggregation used to produce: students with a photo,
    // then students without, then mentors, then admins; newest first inside
    // each group.
    const rank = (u) => {
      if (u.role === "Student") return u.profileImageSaved ? 0 : 1;
      if (u.role === "Mentor") return 2;
      if (u.role === "Admin") return 3;
      return 99;
    };
    rows.sort((a, b) => {
      const byRank = rank(a) - rank(b);
      if (byRank !== 0) return byRank;
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });

    const totalUsers = rows.length;
    const totalPages = Math.ceil(totalUsers / limit) || 1;

    // Counted over the whole filtered directory, not the page being returned.
    // The admin panel shows these as headline figures, and one page holds nine
    // rows sorted students-first, so counting the page made "All Users" report
    // every mentor and admin as zero. Scoped to the same search and filter as
    // `totalUsers`, so the three roles always add up to it.
    const counts = { total: totalUsers, students: 0, mentors: 0, admins: 0 };
    for (const row of rows) {
      if (row.role === "Student") counts.students += 1;
      else if (row.role === "Mentor") counts.mentors += 1;
      else if (row.role === "Admin") counts.admins += 1;
    }

    res.json({
      users: rows.slice(skip, skip + limit),
      counts,
      pagination: {
        currentPage: page,
        totalPages,
        totalUsers,
        limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (err) {
    console.error("Error fetching user profiles:", err);
    res.status(500).json({ message: err.message });
  }
});

// Delete ALL profile images (admin only)
router.delete("/profile-images/all", authenticateToken, requireRole("admin"), async (req, res) => {
  try {
    const result = await Profile.updateMany(
      { profileImageSaved: true },
      { $unset: { profileImage: "" }, $set: { profileImageSaved: false } }
    );
    res.json({
      message: `Successfully deleted ${result.modifiedCount} profile images`,
      deletedCount: result.modifiedCount,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Delete one user's profile image (admin only)
router.delete("/:id/profile-image", authenticateToken, requireRole("Admin"), async (req, res) => {
  try {
    await Profile.updateOne(
      { principalId: String(req.params.id) },
      { $unset: { profileImage: "" }, $set: { profileImageSaved: false } }
    );
    res.json({ message: "Profile image deleted successfully", profileImage: null, profileImageSaved: false });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get full profile including the image (admin only)
router.get("/:id/full-profile", authenticateToken, requireRole("admin"), async (req, res) => {
  try {
    const id = req.params.id;
    const staff = await findStaff(id);

    let base = null;
    if (staff) {
      base = { _id: staff.doc._id, name: staff.doc.name, email: staff.doc.email, role: staff.role };
    } else if (mongoose.Types.ObjectId.isValid(id)) {
      const student = await Student.findById(id).select(STUDENT_FIELDS).lean();
      if (student) base = normalizeStudent(student);
    }

    if (!base) return res.status(404).json({ message: "User not found" });

    const profile = await Profile.findOne({ principalId: String(id) })
      .select("profileImage profileImageSaved")
      .lean();

    res.json({
      ...base,
      profileImage: profile?.profileImage || null,
      profileImageSaved: profile?.profileImageSaved || false,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Let a locked-out student sign in again (admin only).
//
// There is no "blocked" flag to unset: the lockout is the failed-attempt counter
// in services/loginLockout, so unblocking is just forgetting the attempts
// recorded against every identifier this student could have typed.
router.post("/:id/unblock", authenticateToken, requireRole("Admin"), async (req, res) => {
  try {
    const student = await findStudent(req.params.id);
    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    const keys = studentLoginKeys(student);
    lockout.clearAll(keys);

    res.json({
      message: `${student.name} can sign in again.`,
      ...lockout.statusFor(keys),
    });
  } catch (err) {
    console.error("Error unblocking student:", err);
    res.status(500).json({ message: err.message });
  }
});

// Reset a student's password to the shared default (admin only).
//
// This is the one place ExamPro writes to the university's database. Every other
// student field stays read-only and should remain so - but the password a student
// signs in with is the one the university stores, so a reset written anywhere
// else would not be the password they actually use. The write is kept as narrow
// as that reasoning allows: one field, on one document, found by _id.
//
// It is not only ExamPro's view that changes. The university's attendance
// platform authenticates against this same field, so the student's password there
// becomes the default too, and they should be told to change it.
router.post("/:id/reset-password", authenticateToken, requireRole("Admin"), async (req, res, next) => {
  try {
    const student = await findStudent(req.params.id);
    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    // Same cost factor the mentor and admin schemas hash with.
    const password = await bcrypt.hash(DEFAULT_STUDENT_PASSWORD, 10);

    // Not wrapped in withDbRetry: that helper is for reads only, because
    // retrying a write that may already have been applied is a different
    // problem. A failure here reaches the admin, who can press the button again.
    const result = await Student.updateOne({ _id: student._id }, { $set: { password } });
    if (result.matchedCount === 0) {
      return res.status(404).json({ message: "Student not found" });
    }

    // A reset is useless while the old lockout still stands, and a session opened
    // with the previous password must not outlive it.
    lockout.clearAll(studentLoginKeys(student));
    await AuthSession.deleteMany({ principalId: String(student._id) });

    res.json({
      message: `Password for ${student.name} reset to ${DEFAULT_STUDENT_PASSWORD}.`,
      defaultPassword: DEFAULT_STUDENT_PASSWORD,
      ...lockout.statusFor(studentLoginKeys(student)),
    });
  } catch (err) {
    console.error("Error resetting student password:", err);

    // The university's database being unreachable is not a bad request. The
    // global handler turns this into a 503 the admin can act on.
    if (isDatabaseUnavailable(err)) return next(err);

    res.status(500).json({ message: "Could not reset the password. Please try again." });
  }
});

// Create a mentor or an admin (admin only)
router.post("/", authenticateToken, requireRole("Admin"), async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    const subjects = req.body.subjects || req.body.subject || [];

    if (role === "Student") {
      return res.status(400).json({ message: STUDENTS_ARE_READ_ONLY });
    }

    if (!["Mentor", "Admin"].includes(role)) {
      return res.status(400).json({ message: "Role must be either Mentor or Admin" });
    }

    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email and password are required" });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    if (String(password).length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters long" });
    }

    const normalizedEmail = String(email).toLowerCase().trim();

    // An email must identify exactly one account, since login looks it up in
    // both collections.
    const [mentorClash, adminClash] = await Promise.all([
      Mentor.findOne({ email: normalizedEmail }).lean(),
      Admin.findOne({ email: normalizedEmail }).lean(),
    ]);
    if (mentorClash || adminClash) {
      return res.status(400).json({ message: "Email already exists" });
    }

    if (role === "Admin") {
      const admin = await new Admin({ name, email: normalizedEmail, password }).save();
      return res.status(201).json({ _id: admin._id, name: admin.name, email: admin.email, role: "Admin" });
    }

    const subjectIds = (Array.isArray(subjects) ? subjects : [subjects]).filter(Boolean);
    if (subjectIds.some((id) => !mongoose.Types.ObjectId.isValid(id))) {
      return res.status(400).json({ message: "Invalid subject selection" });
    }

    const found = await Subject.countDocuments({ _id: { $in: subjectIds } });
    if (found !== subjectIds.length) {
      return res.status(400).json({ message: "One or more selected subjects do not exist" });
    }

    const mentor = await new Mentor({
      name,
      email: normalizedEmail,
      password,
      subjects: subjectIds,
    }).save();

    const created = await Mentor.findById(mentor._id).select("name email subjects").populate("subjects", "name").lean();
    res.status(201).json({ ...created, role: "Mentor" });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: "Email already exists" });
    }
    console.error("Error creating user:", err);
    res.status(400).json({ message: err.message });
  }
});

// Update a mentor or an admin (admin only)
router.put("/:id", authenticateToken, requireRole("Admin"), async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const subjects = req.body.subjects || req.body.subject;

    const staff = await findStaff(req.params.id);
    if (!staff) {
      return res.status(404).json({ message: `User not found. ${STUDENTS_ARE_READ_ONLY}` });
    }

    if (!name || !email) {
      return res.status(400).json({ message: "Name and email are required" });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const [mentorClash, adminClash] = await Promise.all([
      Mentor.findOne({ email: normalizedEmail, _id: { $ne: staff.doc._id } }).lean(),
      Admin.findOne({ email: normalizedEmail, _id: { $ne: staff.doc._id } }).lean(),
    ]);
    if (mentorClash || adminClash) {
      return res.status(400).json({ message: "Email already exists" });
    }

    staff.doc.name = name;
    staff.doc.email = normalizedEmail;

    // Only set a password when one was actually supplied, so an edit that
    // leaves the field blank keeps the existing password.
    if (password) {
      if (String(password).length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters long" });
      }
      staff.doc.password = password; // hashed by the schema's pre-save hook
    }

    if (staff.role === "Mentor" && subjects !== undefined) {
      const subjectIds = (Array.isArray(subjects) ? subjects : [subjects]).filter(Boolean);
      if (subjectIds.some((id) => !mongoose.Types.ObjectId.isValid(id))) {
        return res.status(400).json({ message: "Invalid subject selection" });
      }
      const found = await Subject.countDocuments({ _id: { $in: subjectIds } });
      if (found !== subjectIds.length) {
        return res.status(400).json({ message: "One or more selected subjects do not exist" });
      }
      staff.doc.subjects = subjectIds;
    }

    await staff.doc.save();

    // A changed password must not leave an old browser session alive.
    if (password) await AuthSession.deleteMany({ principalId: String(staff.doc._id) });

    const Model = staff.role === "Mentor" ? Mentor : Admin;
    const updated = await Model.findById(staff.doc._id)
      .select("name email subjects")
      .populate(staff.role === "Mentor" ? "subjects" : "", "name")
      .lean();

    res.json({ ...updated, role: staff.role });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: "Email already exists" });
    }
    console.error("Error updating user:", err);
    res.status(400).json({ message: err.message });
  }
});

// Delete a mentor or an admin (admin only)
router.delete("/:id", authenticateToken, requireRole("Admin"), async (req, res) => {
  try {
    const staff = await findStaff(req.params.id);
    if (!staff) {
      return res.status(404).json({ message: `User not found. ${STUDENTS_ARE_READ_ONLY}` });
    }

    // Never leave the platform with no way in.
    if (staff.role === "Admin" && (await Admin.countDocuments()) <= 1) {
      return res.status(400).json({ message: "Cannot delete the last remaining admin" });
    }

    const Model = staff.role === "Mentor" ? Mentor : Admin;
    await Model.deleteOne({ _id: staff.doc._id });
    await AuthSession.deleteMany({ principalId: String(staff.doc._id) });
    await Profile.deleteOne({ principalId: String(staff.doc._id) });

    res.json({ message: "User deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Bulk upload used to create student accounts. Students come from the
// university's database now, so there is nothing here left to import.
router.post("/bulk", authenticateToken, requireRole("Admin"), async (req, res) => {
  res.status(400).json({ message: STUDENTS_ARE_READ_ONLY });
});

module.exports = router;
