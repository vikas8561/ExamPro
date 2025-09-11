// Setup Socket.IO server with CORS for frontend URL
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});

// Make io available to routes
app.set('io', io);

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 4000;

connectDB(process.env.MONGODB_URI || 'mongodb://localhost:27017/test-platform')
  .then(() => {
    server.listen(PORT, () => console.log(`API running at http://localhost:${PORT}`));
  })
  .catch((e) => {
    console.error("Mongo connection failed:", e);
    process.exit(1);
  });
