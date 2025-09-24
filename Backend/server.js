// server.js
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const dotenv = require("dotenv");
const { connectDB } = require("./configs/db.config");
const http = require("http");
const { Server } = require("socket.io");

dotenv.config();

// WebSocket Connection Management for 500+ users
let activeConnections = 0;
const MAX_CONNECTIONS = 600; // 20% buffer over 500 users

// Enhanced Memory Management for 500+ users
const memoryUsage = () => {
  const used = process.memoryUsage();
  const formatMB = (bytes) => Math.round(bytes / 1024 / 1024 * 100) / 100;
  
  const memoryStats = {
    rss: `${formatMB(used.rss)} MB`,
    heapTotal: `${formatMB(used.heapTotal)} MB`,
    heapUsed: `${formatMB(used.heapUsed)} MB`,
    external: `${formatMB(used.external)} MB`,
    activeConnections: activeConnections,
    maxConnections: MAX_CONNECTIONS
  };
  
  console.log('📊 Memory & Connection Status:', memoryStats);
  
  // Enhanced memory alerts for 500+ users
  if (used.heapUsed > 500 * 1024 * 1024) { // 500MB (increased for 500 users)
    console.warn('🚨 CRITICAL MEMORY USAGE DETECTED!');
    console.warn(`💾 Heap Used: ${formatMB(used.heapUsed)} MB`);
    console.warn(`👥 Active Connections: ${activeConnections}/${MAX_CONNECTIONS}`);
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
      console.log('🗑️ Emergency garbage collection triggered');
    }
  } else if (used.heapUsed > 300 * 1024 * 1024) { // 300MB warning
    console.warn('⚠️ HIGH MEMORY USAGE DETECTED!');
    console.warn(`💾 Heap Used: ${formatMB(used.heapUsed)} MB`);
    console.warn(`👥 Active Connections: ${activeConnections}/${MAX_CONNECTIONS}`);
  }
  
  // WebSocket connection alerts
  if (activeConnections > MAX_CONNECTIONS * 0.9) { // 90% of limit
    console.warn(`⚠️ WebSocket connections near limit: ${activeConnections}/${MAX_CONNECTIONS}`);
  }
};

// Monitor memory every 15 seconds (more frequent for 500+ users)
setInterval(memoryUsage, 15000);

// Log initial memory usage
memoryUsage();

// Memory cleanup function for 500+ users
const cleanupMemory = () => {
  const used = process.memoryUsage();
  const formatMB = (bytes) => Math.round(bytes / 1024 / 1024 * 100) / 100;
  
  console.log('🧹 Starting memory cleanup...');
  
  // Force garbage collection
  if (global.gc) {
    global.gc();
    console.log('🗑️ Garbage collection completed');
  }
  
  // Log memory after cleanup
  const afterUsed = process.memoryUsage();
  console.log(`📊 Memory before cleanup: ${formatMB(used.heapUsed)} MB`);
  console.log(`📊 Memory after cleanup: ${formatMB(afterUsed.heapUsed)} MB`);
  console.log(`📊 Memory freed: ${formatMB(used.heapUsed - afterUsed.heapUsed)} MB`);
};

// Run memory cleanup every 5 minutes
setInterval(cleanupMemory, 5 * 60 * 1000);

const app = express();

//  Allowed origins (add more if needed)
const allowedOrigins = [
  process.env.FRONTEND_URL,
  "http://localhost:5173",
  "https://cg-test-app.vercel.app"
].filter(Boolean);

// Configure CORS with more permissive settings for production
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return callback(null, true);

    // Allow exact matches OR any Vercel subdomain
    if (allowedOrigins.includes(origin) || 
        origin.endsWith(".vercel.app") || 
        origin.includes("vercel.app")) {
      console.log(`✅ CORS allowing request from: ${origin}`);
      callback(null, true);
    } else {
      console.warn(`❌ CORS blocked request from: ${origin}`);
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: [
    "Content-Type", 
    "Authorization", 
    "X-Requested-With",
    "Accept",
    "Origin",
    "Access-Control-Request-Method",
    "Access-Control-Request-Headers"
  ],
  credentials: true,
  optionsSuccessStatus: 200, // For legacy browser support
}));

// Handle preflight OPTIONS requests explicitly
app.options("*", (req, res) => {
  res.header("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Accept, Origin");
  res.header("Access-Control-Allow-Credentials", "true");
  res.sendStatus(200);
});

// Memory optimization middleware
app.use((req, res, next) => {
  // Set memory-friendly limits
  req.setTimeout(30000); // 30 second timeout
  res.setTimeout(30000);
  
  // Add memory usage to response headers for monitoring
  const memUsage = process.memoryUsage();
  res.set('X-Memory-Usage', Math.round(memUsage.heapUsed / 1024 / 1024));
  
  next();
});

app.use(express.json({ limit: '10mb' })); // Limit JSON payload size
app.use(morgan("dev"));

// Add CORS headers to all responses
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && (allowedOrigins.includes(origin) || origin.includes("vercel.app"))) {
    res.header("Access-Control-Allow-Origin", origin);
  } else {
    res.header("Access-Control-Allow-Origin", "*");
  }
  res.header("Access-Control-Allow-Credentials", "true");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Accept, Origin");
  next();
});

const server = http.createServer(app);

// Setup Socket.IO with same CORS rules
const io = new Server(server, {
  cors: {
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin) || 
          origin.endsWith(".vercel.app") || 
          origin.includes("vercel.app")) {
        console.log(`✅ Socket.IO allowing request from: ${origin}`);
        callback(null, true);
      } else {
        console.warn(`❌ Socket.IO blocked request from: ${origin}`);
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: [
      "Content-Type", 
      "Authorization", 
      "X-Requested-With",
      "Accept",
      "Origin"
    ],
    credentials: true
  }
});

// Basic route to test API health
app.get("/", (req, res) => {
  res.header("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.json({ 
    ok: true, 
    name: "ExamPro API (CJS)",
    timestamp: new Date().toISOString(),
    cors: "enabled"
  });
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.header("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.json({ 
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Memory monitoring endpoint
app.get("/memory", (req, res) => {
  res.header("Access-Control-Allow-Origin", req.headers.origin || "*");
  const memUsage = process.memoryUsage();
  const formatMB = (bytes) => Math.round(bytes / 1024 / 1024 * 100) / 100;
  
  res.json({
    memory: {
      rss: `${formatMB(memUsage.rss)} MB`,
      heapTotal: `${formatMB(memUsage.heapTotal)} MB`,
      heapUsed: `${formatMB(memUsage.heapUsed)} MB`,
      external: `${formatMB(memUsage.external)} MB`
    },
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    nodeVersion: process.version,
    platform: process.platform
  });
});

// ✅ API routes
app.use("/api/tests", require("./routes/tests"));
app.use("/api/assignments", require("./routes/assignments"));
app.use("/api/users", require("./routes/users"));
app.use("/api/reviews", require("./routes/reviews"));
app.use("/api/auth", require("./routes/auth"));
app.use("/api/test-submissions", require("./routes/testSubmissions"));
app.use("/api/answers", require("./routes/answers"));
app.use("/api/practice-tests", require("./routes/practiceTests"));
app.use("/api/mentor", require("./routes/mentor"));
app.use("/api/mentor-fast", require("./routes/mentorAssignmentsFast"));
app.use("/api/debug", require("./routes/debug"));
app.use("/api/subjects", require("./routes/subjects"));
app.use("/api/time", require("./routes/time"));

// Make io available to routes
app.set('io', io);

// Socket.IO connection handling with limits
io.on('connection', (socket) => {
  // Check connection limit
  if (activeConnections >= MAX_CONNECTIONS) {
    console.warn(`⚠️ WebSocket connection limit reached (${MAX_CONNECTIONS}). Disconnecting new connection.`);
    socket.disconnect(true);
    return;
  }
  
  activeConnections++;
  console.log(`📊 WebSocket connections: ${activeConnections}/${MAX_CONNECTIONS}`);

  socket.on('join', (userId) => {
    socket.join(userId.toString());
    console.log(`👤 User ${socket.id} joined room: ${userId} (Total: ${activeConnections})`);
  });

  socket.on('disconnect', () => {
    activeConnections--;
    console.log(`👤 User disconnected: ${socket.id} (Total: ${activeConnections})`);
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
    server.listen(PORT, () => {
      // Server started successfully
    });
  })
  .catch((e) => {
    console.error("Mongo connection failed:", e);
    process.exit(1);
  });
