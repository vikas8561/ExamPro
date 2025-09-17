const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const dotenv = require("dotenv");
const { connectDB } = require("./configs/db.config");
const http = require("http");
const { Server } = require("socket.io");

dotenv.config();

const app = express();

// Define allowed origins
const allowedOrigins = [
  process.env.FRONTEND_URL,
  "http://localhost:5173",
  "https://cg-test-app.vercel.app",
  "https://cg-test-app.vercel.app/",
  "https://cg-test-app.vercel.app/*"
].filter(Boolean);

// Manual CORS middleware - MUST be first
app.use((req, res, next) => {
  const origin = req.headers.origin;
  
  console.log('CORS Request:', {
    method: req.method,
    origin: origin,
    url: req.url
  });
  
  // More permissive CORS - allow all origins for now to test
  res.header('Access-Control-Allow-Origin', origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-auth-token, Accept, Origin, X-Requested-With');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Max-Age', '86400'); // 24 hours
  
  console.log('CORS: Headers set for origin:', origin);

  // Handle preflight requests immediately
  if (req.method === 'OPTIONS') {
    console.log('CORS: Handling preflight request for:', req.url);
    res.status(200).end();
    return;
  }
  
  next();
});

// Additional CORS middleware using cors package - more permissive
app.use(cors({
  origin: true, // Allow all origins for now
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token', 'Accept', 'Origin', 'X-Requested-With'],
  optionsSuccessStatus: 200 // For legacy browser support
}));
app.use(express.json());
app.use(morgan("dev"));

const server = http.createServer(app);

// Setup Socket.IO server with CORS for frontend URL
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token', 'Accept', 'Origin', 'X-Requested-With'],
    credentials: true
  }
});

// Global OPTIONS handler for all routes
app.options('*', (req, res) => {
  console.log('Global OPTIONS handler triggered for:', req.url);
  res.status(200).end();
});

// Routes
app.get("/", (req, res) => res.json({ ok: true, name: "ExamPro API (CJS)" }));

// Health check endpoint for CORS testing
app.get("/health", (req, res) => {
  res.json({ 
    status: "OK", 
    timestamp: new Date().toISOString(),
    origin: req.headers.origin,
    userAgent: req.headers['user-agent']
  });
});

// CORS test endpoint
app.get("/cors-test", (req, res) => {
  res.json({ 
    message: "CORS is working!",
    origin: req.headers.origin,
    method: req.method,
    headers: req.headers
  });
});
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

// Make io available to routes
app.set('io', io);

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // Handle room joining for targeted events
  socket.on('join', (userId) => {
    socket.join(userId.toString());
    console.log(`User ${socket.id} joined room: ${userId}`);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

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

// Enhanced error handling and logging
console.log('Starting ExamPro Backend Server...');
console.log('Environment:', {
  NODE_ENV: process.env.NODE_ENV,
  PORT: PORT,
  FRONTEND_URL: process.env.FRONTEND_URL,
  MONGODB_URI: process.env.MONGODB_URI ? 'Set' : 'Not set'
});

connectDB(process.env.MONGODB_URI || 'mongodb://localhost:27017/test-platform')
  .then(() => {
    console.log('MongoDB connected successfully');
    server.listen(PORT, () => {
      console.log(`🚀 ExamPro API running at http://localhost:${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/health`);
      console.log(`🔧 CORS test: http://localhost:${PORT}/cors-test`);
    });
  })
  .catch((e) => {
    console.error("❌ MongoDB connection failed:", e);
    console.error("Please check your MONGODB_URI environment variable");
    process.exit(1);
  });

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
    process.exit(0);
  });
});
