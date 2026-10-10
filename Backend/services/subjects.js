const Subject = require("../models/Subject");

// "ALL" is a Subject document only so an admin can assign it to a mentor as
// "every subject". It is not a subject a test can belong to, so it is left out
// of every subject list except the ones admins use to assign mentor subjects.
const isAllSubject = (name) => String(name || "").trim().toLowerCase() === "all";

const REAL_SUBJECTS = { name: { $not: /^\s*all\s*$/i } };

// The subjects a mentor actually teaches: every real subject when they hold
// "ALL", otherwise their assigned subjects without it.
async function expandMentorSubjects(assigned) {
  const list = assigned || [];
  if (list.some((s) => isAllSubject(typeof s === "string" ? s : s?.name))) {
    return Subject.find(REAL_SUBJECTS).select("name description").sort({ name: 1 }).lean();
  }
  return list.filter((s) => !isAllSubject(typeof s === "string" ? s : s?.name));
}

module.exports = { isAllSubject, REAL_SUBJECTS, expandMentorSubjects };
