const mongoose = require("mongoose");

/**
 * The ExamPro database connection.
 *
 * The pool settings here matter more than they look. The cluster is a shared
 * Atlas tier with a hard ceiling of 500 connections for the whole project, and
 * the previous configuration asked a single Node process for a floor of 125
 * idle connections while also closing anything idle for two minutes. Those two
 * settings fight each other: the pool trims an idle connection, notices it is
 * below minPoolSize, and immediately opens a replacement -- forever. The
 * cluster had recorded 871,000 connections created over eight days of uptime,
 * roughly one and a third every second, each one a TCP handshake plus a TLS
 * handshake plus SCRAM authentication, and each one counting against the same
 * 500 that real queries need.
 *
 * A pool does not need a large floor. Connections are created on demand in
 * well under the time a query takes, so a small floor covers the idle case and
 * maxPoolSize covers the busy one. maxPoolSize is deliberately far below the
 * cluster ceiling too: one process must not be able to exhaust it, or a second
 * instance (or a deploy overlapping the old one) cannot connect at all.
 */
async function connectDB(uri) {
  mongoose.set("strictQuery", true);

  await mongoose.connect(uri, {
    // Pool. A small warm floor, a ceiling that leaves room for other instances
    // and for the university connection in configs/studentDb.js.
    maxPoolSize: 100,
    minPoolSize: 5,
    // Long enough that a normally busy server never trims a connection it is
    // about to want back. Paired with the small floor, this ends the churn.
    maxIdleTimeMS: 600000,
    maxConnecting: 10,

    // Timeouts.
    serverSelectionTimeoutMS: 15000,
    socketTimeoutMS: 90000,
    connectTimeoutMS: 20000,

    // Reads come straight from the primary, which is where every write lands,
    // so they are already read-your-own-writes consistent. "majority" added a
    // wait for the majority commit point to every single read for no benefit
    // this application can observe.
    retryWrites: true,
    retryReads: true,
    readPreference: "primary",
    readConcern: { level: "local" },

    heartbeatFrequencyMS: 10000,
    bufferCommands: false,

    // Left on, as it was, so the indexes declared on the models exist without a
    // separate migration step. Set MONGO_AUTO_INDEX=false once the schema is
    // settled to skip the createIndex round trips at boot.
    autoIndex: process.env.MONGO_AUTO_INDEX !== "false",
  });

  console.log("✅ MongoDB connected (pool 5-100)");
}

module.exports = { connectDB };
