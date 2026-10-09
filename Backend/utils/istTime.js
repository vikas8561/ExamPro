/**
 * Dates the server writes into messages a person reads are India Standard
 * Time, labelled -- never the server's own locale (which depends on where it
 * happens to be hosted) and never raw UTC ISO strings. The browser formats
 * the same way (Frontend/src/utils/istTime.js), so a student reads the same
 * time in an error as on their card.
 */
const IST_TIME_ZONE = "Asia/Kolkata";

const formatter = new Intl.DateTimeFormat("en-US", {
  timeZone: IST_TIME_ZONE,
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** "Oct 7, 2026, 02:30 PM IST"; "" for a missing or invalid date. */
function formatIST(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${formatter.format(d)} IST`;
}

module.exports = { IST_TIME_ZONE, formatIST };
