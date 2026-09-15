const Student = require("../models/Student");
const Mentor = require("../models/Mentor");
const Admin = require("../models/Admin");

// Identities now live in three places: students in the university's database,
// mentors and admins in ExamPro's own `mentors` / `admins` collections. Mongoose
// cannot `populate()` across two connections, so everything that used to read
// `.populate("userId", "name email")` calls the helpers here instead. They all
// return the same shape the old populate produced - `{ _id, name, email }` plus
// a few student-only extras - so callers and the frontend see no difference.

const STUDENT_FIELDS = "studentName studentEmail UniversityUID rollno University";

// The app targets assignments at RU or SU cohorts. The university database
// records the full institution name instead, so derive the category from it:
// Rai University is RU, every other campus (Swarrnim, SUxCG, CG LAB) is SU.
function categoryOf(university) {
  return university === "Rai University" ? "RU" : "SU";
}

function normalizeStudent(doc) {
  if (!doc) return null;
  return {
    _id: doc._id,
    name: doc.studentName || doc.rollno || doc.UniversityUID || "Unknown student",
    // Students sign in with a UID or roll number and many have no address on
    // file, so `email` can legitimately be empty here.
    email: doc.studentEmail || "",
    rollno: doc.rollno || "",
    universityUID: doc.UniversityUID || "",
    university: doc.University || "",
    studentCategory: categoryOf(doc.University),
    role: "Student",
  };
}

function normalizeMentor(doc) {
  if (!doc) return null;
  return { _id: doc._id, name: doc.name, email: doc.email, role: "Mentor" };
}

function normalizeAdmin(doc) {
  if (!doc) return null;
  return { _id: doc._id, name: doc.name, email: doc.email, role: "Admin" };
}

// The cohorts a test can be assigned to. The university database has no notion
// of a batch - it records the campus in `University` - so each cohort is just a
// filter over that field. This is the single source of truth: the assign route
// and the admin UI both read it, so adding a campus means adding one entry here.
const COHORTS = [
  { key: "all", label: "All Students", description: "Every student on the university roster", filter: {} },
  { key: "ru", label: "Rai University", description: "Rai University", filter: { University: "Rai University" } },
  { key: "su702", label: "SU 2025 LAB 702", description: "SUxCG 702", filter: { University: "SUxCG 702" } },
  { key: "su714", label: "SU 2025 LAB 714", description: "SUxCG 714", filter: { University: "SUxCG 714" } },
  { key: "cglab3", label: "SU 2026 LAB 3", description: "CG LAB 3", filter: { University: "CG LAB 3" } },
  { key: "cglab4", label: "SU 2026 LAB 4", description: "CG LAB 4", filter: { University: "CG LAB 4" } },
  {
    key: "ssiu",
    label: "SSIU 2026",
    description: "Swarrnim Startup & Innovation University",
    filter: { University: "Swarrnim Startup & Innovation University" },
  },
];

const COHORTS_BY_KEY = new Map(COHORTS.map((c) => [c.key, c]));

function getCohort(key) {
  return COHORTS_BY_KEY.get(key) || null;
}

// The roster for one of the COHORTS above, by key.
async function findStudentsByCohort(key) {
  const cohort = getCohort(key);
  if (!cohort) return null;
  const docs = await Student.find(cohort.filter)
    .select(STUDENT_FIELDS)
    .lean()
    .maxTimeMS(20000);
  return docs.map(normalizeStudent);
}

// How many students each cohort currently holds, for the admin UI.
async function cohortCounts() {
  const counts = await Promise.all(
    COHORTS.map((c) => Student.countDocuments(c.filter).maxTimeMS(10000))
  );
  return COHORTS.map((c, i) => ({
    key: c.key,
    label: c.label,
    description: c.description,
    count: counts[i],
  }));
}

async function findStudentById(id) {
  return normalizeStudent(await Student.findById(id).select(STUDENT_FIELDS).lean());
}

async function findPrincipalById(id, role) {
  if (role === "Student") return findStudentById(id);
  if (role === "Mentor") return normalizeMentor(await Mentor.findById(id).select("name email").lean());
  if (role === "Admin") return normalizeAdmin(await Admin.findById(id).select("name email").lean());
  return null;
}

// Batch-load a set of ids into a Map keyed by string id. One query per call, so
// hydrating a page of assignments costs the same as the old populate did.
async function studentMap(ids) {
  const unique = [...new Set((ids || []).filter(Boolean).map(String))];
  if (!unique.length) return new Map();
  const docs = await Student.find({ _id: { $in: unique } }).select(STUDENT_FIELDS).lean();
  return new Map(docs.map((d) => [String(d._id), normalizeStudent(d)]));
}

async function mentorMap(ids) {
  const unique = [...new Set((ids || []).filter(Boolean).map(String))];
  if (!unique.length) return new Map();
  const docs = await Mentor.find({ _id: { $in: unique } }).select("name email").lean();
  return new Map(docs.map((d) => [String(d._id), normalizeMentor(d)]));
}

// Tests, subjects and DSA questions are created by an admin or by a mentor, so
// resolving a `createdBy` means checking both collections.
async function authorMap(ids) {
  const unique = [...new Set((ids || []).filter(Boolean).map(String))];
  if (!unique.length) return new Map();
  const [admins, mentors] = await Promise.all([
    Admin.find({ _id: { $in: unique } }).select("name email").lean(),
    Mentor.find({ _id: { $in: unique } }).select("name email").lean(),
  ]);
  const map = new Map();
  admins.forEach((d) => map.set(String(d._id), normalizeAdmin(d)));
  mentors.forEach((d) => map.set(String(d._id), normalizeMentor(d)));
  return map;
}

const LOADERS = { Student: studentMap, Mentor: mentorMap, Author: authorMap };

// Replace an id field with the resolved identity, exactly as
// `.populate(path, "name email")` used to. Accepts one document or an array, and
// either lean objects or mongoose documents - a mongoose document is converted
// to a plain object first, because assigning an identity onto an ObjectId path
// would fail to cast. Always returns plain objects, so callers must use the
// return value rather than relying on mutation. Unknown ids become null instead
// of throwing, so an assignment whose mentor was deleted still renders.
async function attach(docs, path, kind) {
  const wasArray = Array.isArray(docs);
  const list = (wasArray ? docs : [docs])
    .filter(Boolean)
    .map((d) => (typeof d.toObject === "function" ? d.toObject({ virtuals: true }) : d));

  if (list.length) {
    const map = await LOADERS[kind](list.map((d) => d[path]));
    for (const doc of list) {
      const id = doc[path];
      doc[path] = id ? map.get(String(id)) || null : null;
    }
  }

  return wasArray ? list : list[0] || null;
}

// Hydrate several id fields in one pass, e.g.
// attachAll(assignments, [["userId", "Student"], ["mentorId", "Mentor"]]).
async function attachAll(docs, specs) {
  let result = docs;
  for (const [path, kind] of specs) {
    result = await attach(result, path, kind);
  }
  return result;
}

module.exports = {
  categoryOf,
  normalizeStudent,
  normalizeMentor,
  normalizeAdmin,
  COHORTS,
  getCohort,
  findStudentsByCohort,
  cohortCounts,
  findStudentById,
  findPrincipalById,
  studentMap,
  mentorMap,
  authorMap,
  attach,
  attachAll,
  STUDENT_FIELDS,
};
