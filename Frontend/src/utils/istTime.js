/**
 * Every time the platform shows or reads is India Standard Time.
 *
 * `toLocaleString()` with no `timeZone` formats in the DEVICE's timezone. On a
 * laptop left on US Pacific, a test a mentor scheduled for 2:30 PM showed as
 * "02:00 AM", and the student had no way to tell which was right. The same was
 * true the other way round: a `datetime-local` value is read in the device's
 * timezone, so a mentor whose laptop was set wrongly would have scheduled the
 * test hours off.
 *
 * Exams are run in India, so one zone is the truth for everyone: dates and
 * times are formatted in Asia/Kolkata and carry an "IST" label, and times typed
 * into the schedule inputs are read as IST. IST has had no daylight saving
 * since 1945, so a fixed +05:30 is exact for converting typed values.
 */

export const IST_TIME_ZONE = "Asia/Kolkata";
export const IST_LABEL = "IST";
const IST_OFFSET_MS = (5 * 60 + 30) * 60000;

const formatters = new Map();
function formatter(locale, options) {
  const key = `${locale}|${JSON.stringify(options)}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, { ...options, timeZone: IST_TIME_ZONE });
    formatters.set(key, f);
  }
  return f;
}

function toDate(value) {
  if (value === null || value === undefined || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

const hasTimeOfDay = (options) =>
  Boolean(options.hour || options.minute || options.second || options.timeStyle);

/**
 * Format `value` in IST with `Intl.DateTimeFormat` options. Anything showing a
 * time of day gets " IST" appended so nobody has to guess which zone it is.
 * Returns `fallback` for a missing or invalid date.
 */
export function formatIST(value, options = {}, { locale = "en-US", fallback = "—", label } = {}) {
  const d = toDate(value);
  if (!d) return fallback;
  const text = formatter(locale, options).format(d);
  const withLabel = label ?? hasTimeOfDay(options);
  return withLabel ? `${text} ${IST_LABEL}` : text;
}

/** "Oct 7, 02:30 PM IST" */
export const formatDateTimeIST = (value, fallback) =>
  formatIST(value, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }, { fallback });

/** "Oct 7, 2026, 02:30 PM IST" */
export const formatFullDateTimeIST = (value, fallback) =>
  formatIST(
    value,
    { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" },
    { fallback }
  );

/** "Oct 7, 2026" */
export const formatDateIST = (value, fallback) =>
  formatIST(value, { year: "numeric", month: "short", day: "numeric" }, { fallback });

/** "02:30:05 PM IST" */
export const formatTimeIST = (value, fallback) =>
  formatIST(value, { hour: "2-digit", minute: "2-digit", second: "2-digit" }, { fallback });

function istParts(value) {
  const d = toDate(value);
  if (!d) return null;
  const parts = {};
  formatter("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(d)
    .forEach((p) => {
      parts[p.type] = p.value;
    });
  return parts;
}

/** The IST calendar day of `value` as "YYYY-MM-DD", for "is it today?" checks. */
export function istDayKey(value) {
  const p = istParts(value);
  return p ? `${p.year}-${p.month}-${p.day}` : "";
}

/** The hour (0-23) in IST, for greetings. */
export function istHour(value) {
  const p = istParts(value);
  return p ? Number(p.hour) : 0;
}

/**
 * A `datetime-local` value ("2026-10-07T14:30") read as IST, whatever the
 * device's timezone. Returns null when it cannot be parsed.
 */
export function parseISTInput(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(text || "").trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m.map(Number);
  const utcMs = Date.UTC(y, mo - 1, d, h, mi, s || 0) - IST_OFFSET_MS;
  return new Date(utcMs);
}

/** The IST wall time of `value` as a `datetime-local` value ("YYYY-MM-DDTHH:mm"). */
export function toISTInputValue(value) {
  const p = istParts(value);
  return p ? `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}` : "";
}
