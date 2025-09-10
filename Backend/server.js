const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const dotenv = require("dotenv");
const { connectDB } = require("./configs/db.config");

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

// Routes
app.get("/", (req, res) => res.json({ ok: true, name: "ExamPro API (CJS)" }));
app.use("/api/tests", require("./routes/tests"));
app.use("/api/assignments", require("./routes/assignments"));
app.use("/api/users", require("./routes/users"));
app.use("/api/reviews", require("./routes/reviews"));
app.use("/api/auth", require("./routes/auth"));
app.use("/api/test-submissions", require("./routes/testSubmissions"));
app.use("/api/answers", require("./routes/answers"));
app.use("/api/mentor", require("./routes/mentor"));
app.use("/api/debug", require("./routes/debug"));
app.use("/api/subjects", require("./routes/subjects"));
app.use("/api/time", require("./routes/time"));

// Error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  if (err.name === "ValidationError") {
    return res.status(400).json({ message: err.message });
  }
  res.status(500).json({ message: "Server error" });
});

const PORT = process.env.PORT || 4000;

connectDB(process.env.MONGODB_URI || 'mongodb://localhost:27017/test-platform')
  .then(() => {
    app.listen(PORT, () => console.log(`API running at http://localhost:${PORT}`));
  })
  .catch((e) => {
    console.error("Mongo connection failed:", e);
    process.exit(1);
  });
