// server.js
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const dotenv = require("dotenv");
const { connectDB } = require("./configs/db.config");
const http = require("http");
const { Server } = require("socket.io");

// Performance optimizations
const {
  compressionMiddleware,
  securityMiddleware,
  deduplicationMiddleware,
  performanceMiddleware,
  optimizeDatabase
} = require("./middleware/performance");

const { redisCacheMiddleware } = require("./middleware/redisCache");

dotenv.config();

const app = express();

// Apply performance middleware
app.use(compressionMiddleware);
app.use(securityMiddleware);
app.use(performanceMiddleware);
app.use(deduplicationMiddleware);

//  Allowed origins (add more if needed)
const allowedOrigins = [
  process.env.FRONTEND_URL,
  "http://localhost:5173",
  "https://cg-test-app.vercel.app"
].filter(Boolean);

// Configure CORS
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return callback(null, true);

    // Allow exact matches OR any Vercel preview subdomain
    if (allowedOrigins.includes(origin) || origin.endsWith(".vercel.app")) {
      callback(null, true);
    } else {
      console.warn(`❌ CORS blocked request from: ${origin}`);
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
}));

// Handle preflight OPTIONS requests explicitly
app.options("*", cors());

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan("combined"));

// Rate limiting removed for exam system to handle unlimited students
// app.use('/api/auth', authRateLimit);
// app.use('/api', apiRateLimit);
// app.use(generalRateLimit);

const server = http.createServer(app);

// Setup Socket.IO with same CORS rules
const io = new Server(server, {
  cors: {
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin) || origin.endsWith(".vercel.app")) {
        callback(null, true);
      } else {
        console.warn(`Socket.IO blocked request from: ${origin}`);
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Basic route to test API health
app.get("/", (req, res) => res.json({ ok: true, name: "ExamPro API (CJS)" }));

// ✅ API routes
app.use("/api/tests", require("./routes/tests"));
app.use("/api/assignments", require("./routes/assignments"));
app.use("/api/users", require("./routes/users"));
app.use("/api/reviews", require("./routes/reviews"));
app.use("/api/auth", require("./routes/auth"));
app.use("/api/test-submissions", require("./routes/testSubmissions"));
app.use("/api/answers", require("./routes/answers"));
app.use("/api/mentor", require("./routes/mentor"));
app.use("/api/mentor-fast", require("./routes/mentorAssignmentsFast"));
app.use("/api/debug", require("./routes/debug"));
app.use("/api/subjects", require("./routes/subjects"));
app.use("/api/time", require("./routes/time"));

// Make io available to routes
app.set('io', io);

// Socket.IO connection handling
io.on('connection', (socket) => {
  // console.log('A user connected:', socket.id);

  socket.on('join', (userId) => {
    socket.join(userId.toString());
    // console.log(`User ${socket.id} joined room: ${userId}`);
  });

  socket.on('disconnect', () => {
    // console.log('User disconnected:', socket.id);
  });
});

// Global error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error("Server Error:", err.message || err);
  if (err.name === "ValidationError") {
    return res.status(400).json({ message: err.message });
  }
  res.status(500).json({ message: "Server error" });
});

const PORT = process.env.PORT || 4000;

// Connect to DB and start server
connectDB(process.env.MONGODB_URI || 'mongodb://localhost:27017/test-platform')
  .then(() => {
    server.listen(PORT, () => // console.log(`API running at http://localhost:${PORT}`));
  })
  .catch((e) => {
    console.error("Mongo connection failed:", e);
    process.exit(1);
  });
