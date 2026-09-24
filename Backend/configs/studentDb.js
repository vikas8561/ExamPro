const mongoose = require("mongoose");

// The university's attendance platform owns the student records and their
// passwords. ExamPro only ever reads from it, never writes, so it gets its own
// small connection rather than sharing the main ExamPro pool.
let studentConnection = null;

function getStudentConnection() {
  if (studentConnection) return studentConnection;

  const uri = process.env.MONGODB_URI_ONE;
  if (!uri) {
    throw new Error("MONGODB_URI_ONE is not set - student login cannot work without it");
  }

  studentConnection = mongoose.createConnection(uri, {
    // Only logins and roster reads run here, so the pool stays small.
    maxPoolSize: 50,
    minPoolSize: 5,
    // Matches the ExamPro pool in db.config.js, and for the same reason: a floor
    // of 5 against a two-minute idle timeout just trims connections and reopens
    // them forever. Idle connections are cheap; the handshakes are not.
    maxIdleTimeMS: 600000,
    serverSelectionTimeoutMS: 15000,
    connectTimeoutMS: 20000,

    // No `socketTimeoutMS`. It used to be 45 seconds here, against the ten
    // minute idle time above, and this connection felt it worst of all: nothing
    // touches it except a student signing in, so it was almost always idle for
    // longer than 45 seconds. The socket was destroyed while the pool still
    // considered the connection usable, and the next login wrote to a dead
    // socket and failed with `EPIPE` in a few milliseconds.
    //
    // Admin and mentor logins were unaffected — they read from the ExamPro
    // database on the other connection — so it looked like students specifically
    // could not sign in, intermittently, with the database plainly up.
    retryWrites: false,
    retryReads: true,
    readPreference: "primary",
    autoIndex: false, // read-only: never create indexes in the university's DB
  });

  studentConnection.on("connected", () => console.log("✅ University student DB connected"));
  studentConnection.on("error", (err) => console.error("❌ University student DB error:", err.message));

  return studentConnection;
}

module.exports = { getStudentConnection };
