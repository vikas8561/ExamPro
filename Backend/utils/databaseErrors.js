/**
 * Is this error the database being unreachable, rather than the request being
 * wrong?
 *
 * The distinction matters to the person on the other end. A student whose login
 * fails during an Atlas outage is told "invalid credentials" or "login failed"
 * unless something makes this call, and they will retype a correct password over
 * and over while an invigilator watches. Saying "the database is temporarily
 * unavailable" costs nothing and is true.
 *
 * Two shapes have to be recognised, and only the first is obvious:
 *
 *   1. The driver's own errors, which arrive with a recognisable `name` —
 *      `MongoServerSelectionError` when a DNS lookup or a failover means no
 *      server can be chosen.
 *
 *   2. A plain socket error thrown from inside a driver write, which arrives as
 *      an ordinary `Error` named "Error" and is identifiable only by its `code`.
 *      `EPIPE` is the common one: the connection was open a moment ago and died
 *      mid-write. A name-based check misses these entirely.
 */

const DRIVER_ERROR_NAMES = new Set([
  "MongoServerSelectionError",
  "MongoNetworkError",
  "MongoNetworkTimeoutError",
  "MongoTimeoutError",
  "MongoNotConnectedError",
]);

// Socket and resolver failures. ENOTFOUND and EAI_AGAIN are DNS; the rest are a
// connection that went away.
const NETWORK_ERROR_CODES = new Set([
  "EPIPE",
  "ECONNRESET",
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENETUNREACH",
]);

function isDatabaseUnavailable(error) {
  if (!error) return false;
  if (DRIVER_ERROR_NAMES.has(error.name)) return true;
  if (typeof error.code === "string" && NETWORK_ERROR_CODES.has(error.code)) return true;

  // The driver wraps the original failure; the useful detail is often one level
  // down rather than on the error itself.
  if (error.cause) return isDatabaseUnavailable(error.cause);

  return false;
}

/**
 * Run a read, and run it once more if the connection turned out to be dead.
 *
 * A pooled connection can be handed out after its socket has already gone —
 * killed by a network change, a VPN dropping, a laptop waking, or the server
 * hanging up on an idle connection. Nothing notices until something writes to
 * it, and then the write fails immediately with `EPIPE` or `ECONNRESET`. The
 * failure is instant rather than slow, which is how to tell it apart from the
 * database genuinely being down.
 *
 * The driver discards the bad connection on its way out, so a second attempt
 * gets a fresh one and succeeds. Without this, whichever request happened to be
 * first after a network blip simply fails — and for a connection used only when
 * somebody signs in, that is very often a login.
 *
 * Only for reads. Retrying a write that may already have been applied is a
 * different problem and not one to solve by accident here.
 */
const DEFAULT_BUDGET_MS = 6000;

/**
 * Stop waiting once the budget is spent.
 *
 * This does not cancel the query — the driver carries on and tidies up on its
 * own — it stops the *request* waiting on it. That distinction is fine for a
 * read, and it is the whole point: without it, a caller inherits the driver's
 * `serverSelectionTimeoutMS`, which is fifteen seconds. Fifteen seconds is a
 * sensible ceiling for a background job and an unusable one for somebody who
 * just pressed a button, who will assume it is broken and press it again.
 */
function withDeadline(promise, msLeft) {
  let timer;
  const expiry = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error("Timed out waiting for the database");
      error.code = "ETIMEDOUT";
      reject(error);
    }, Math.max(0, msLeft));
  });

  return Promise.race([promise, expiry]).finally(() => clearTimeout(timer));
}

async function withDbRetry(read, { timeoutMs = DEFAULT_BUDGET_MS } = {}) {
  const deadline = Date.now() + timeoutMs;

  try {
    return await withDeadline(read(), deadline - Date.now());
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;

    // No budget left to try again with; report what went wrong rather than
    // spending another fifteen seconds discovering it a second time.
    if (Date.now() >= deadline) throw error;

    // A moment for the driver to retire the dead connection before asking again.
    await new Promise((resolve) => setTimeout(resolve, 50));
    return withDeadline(read(), deadline - Date.now());
  }
}

module.exports = {
  isDatabaseUnavailable,
  withDbRetry,
  DRIVER_ERROR_NAMES,
  NETWORK_ERROR_CODES,
};
