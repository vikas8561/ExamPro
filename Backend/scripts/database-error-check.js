/**
 * Telling a database outage apart from a bad request.
 *
 * This runs at the worst possible moment — an Atlas failover or a dropped VPN,
 * usually mid-exam — which is exactly when nobody can safely go and debug it. So
 * the classification is pinned here against the two error shapes seen in a real
 * outage, reproduced exactly as they arrived.
 *
 * Getting it wrong in either direction has a cost. Miss an outage and students
 * are told their password is wrong and retype it until someone escalates. Call
 * an ordinary bug an outage and it hides behind a soothing "try again shortly"
 * that nobody investigates.
 *
 * Run with:  npm run test:db-errors
 */

const { isDatabaseUnavailable, withDbRetry } = require("../utils/databaseErrors");

let pass = 0,
  fail = 0;
const check = (label, ok) => {
  if (ok) {
    pass++;
    console.log(`PASS  ${label}`);
  } else {
    fail++;
    console.log(`FAIL  ${label}`);
  }
};

console.log("\n════ Real outage errors ════\n");

// Verbatim from a production log: DNS stopped resolving the Atlas shards, and
// every login blocked for the full 15s serverSelectionTimeoutMS before failing.
const selection = new Error(
  "getaddrinfo ENOTFOUND ac-3eflge6-shard-00-01.0yqydlr.mongodb.net"
);
selection.name = "MongoServerSelectionError";
check("MongoServerSelectionError is an outage", isDatabaseUnavailable(selection));

// From the same log, and the one a name-based check misses: a socket error
// thrown from inside a driver write arrives as a plain Error called "Error".
const epipe = new Error("write EPIPE");
epipe.code = "EPIPE";
epipe.errno = -32;
epipe.syscall = "write";
check("a raw EPIPE from a driver write is an outage", isDatabaseUnavailable(epipe));

const nested = new Error("connection failed");
nested.cause = Object.assign(new Error("getaddrinfo ENOTFOUND"), {
  code: "ENOTFOUND",
});
check("a wrapped cause is unwrapped", isDatabaseUnavailable(nested));

for (const code of ["ECONNRESET", "ECONNREFUSED", "EAI_AGAIN", "ETIMEDOUT"]) {
  check(`${code} is an outage`, isDatabaseUnavailable(Object.assign(new Error("x"), { code })));
}

for (const name of [
  "MongoNetworkError",
  "MongoNetworkTimeoutError",
  "MongoTimeoutError",
  "MongoNotConnectedError",
]) {
  check(`${name} is an outage`, isDatabaseUnavailable(Object.assign(new Error("x"), { name })));
}

console.log("\n════ Things that are NOT outages ════\n");

check(
  "a validation error is the request's fault, not the server's",
  !isDatabaseUnavailable(Object.assign(new Error("bad"), { name: "ValidationError" }))
);
check(
  "a duplicate-key error is not an outage (its code is a number, not a string)",
  !isDatabaseUnavailable(Object.assign(new Error("dup"), { code: 11000 }))
);
check("a CastError is not an outage", !isDatabaseUnavailable(Object.assign(new Error("x"), { name: "CastError" })));
check("an ordinary bug is not an outage", !isDatabaseUnavailable(new TypeError("x is not a function")));
check("an unrelated errno code is not an outage", !isDatabaseUnavailable(Object.assign(new Error("x"), { code: "ENOENT" })));

console.log("\n════ Nothing here may throw ════\n");

check("null", !isDatabaseUnavailable(null));
check("undefined", !isDatabaseUnavailable(undefined));
check("an empty object", !isDatabaseUnavailable({}));
check("a string", !isDatabaseUnavailable("boom"));

console.log("\n════ Retrying a read that hit a dead connection ════\n");

(async () => {
  let attempts = 0;
  const deadFirstTime = () => {
    attempts += 1;
    if (attempts === 1) {
      const err = new Error("write EPIPE");
      err.code = "EPIPE";
      throw err;
    }
    return "rows";
  };
  check("a read that hits a dead socket succeeds on retry", (await withDbRetry(deadFirstTime)) === "rows");
  check("and is attempted exactly twice", attempts === 2);

  // A genuine bug must not be retried — that would double every side effect and
  // hide the stack trace behind a second identical failure.
  let bugAttempts = 0;
  try {
    await withDbRetry(() => {
      bugAttempts += 1;
      throw new TypeError("x is not a function");
    });
    check("an ordinary bug is not retried", false);
  } catch (err) {
    check("an ordinary bug is rethrown untouched", err instanceof TypeError && bugAttempts === 1);
  }

  // A real outage is still an outage. One retry, then give up honestly.
  let outageAttempts = 0;
  try {
    await withDbRetry(() => {
      outageAttempts += 1;
      const err = new Error("no primary available");
      err.name = "MongoServerSelectionError";
      throw err;
    });
    check("a real outage still fails", false);
  } catch {
    check("a real outage still fails, after exactly one retry", outageAttempts === 2);
  }

  console.log("\n════ Giving up in time to answer the request ════\n");

  // The failure from the log: the driver blocks for its fifteen-second server
  // selection timeout, the request never responds, and the student clicks again.
  const hangsForever = () => new Promise(() => {});
  const startedAt = Date.now();
  try {
    await withDbRetry(hangsForever, { timeoutMs: 400 });
    check("a hanging query is abandoned", false);
  } catch (err) {
    check("a hanging query is abandoned rather than blocking the request", Date.now() - startedAt < 1200);
    check("and is reported as an outage, so the caller gets a 503", isDatabaseUnavailable(err));
  }

  const budgetStart = Date.now();
  try {
    await withDbRetry(hangsForever, { timeoutMs: 600 });
  } catch {
    /* expected */
  }
  check("the budget covers both attempts, not one each", Date.now() - budgetStart < 1500);

  // A query that is merely slow must not be cut off.
  const slowButFine = async () => {
    await new Promise((resolve) => setTimeout(resolve, 200));
    return "rows";
  };
  check("a slow but successful read is left alone", (await withDbRetry(slowButFine, { timeoutMs: 2000 })) === "rows");

  console.log("\n──────────────");
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
