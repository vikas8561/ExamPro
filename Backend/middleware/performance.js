const compression = require('compression');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Compression middleware
const compressionMiddleware = compression({
  level: 6,
  threshold: 1024, // Only compress responses > 1KB
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  }
});

// Security headers
const securityMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://cg-test-app.onrender.com"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false
});

// Rate limiting
const createRateLimit = (windowMs, max, message) => {
  return rateLimit({
    windowMs,
    max,
    message: { error: message },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({
        error: message,
        retryAfter: Math.round(windowMs / 1000)
      });
    }
  });
};

// Different rate limits for different endpoints
const generalRateLimit = createRateLimit(
  15 * 60 * 1000, // 15 minutes
  100, // 100 requests per window
  'Too many requests from this IP, please try again later.'
);

const authRateLimit = createRateLimit(
  1 * 60 * 1000, // 1 minute
  300, // 300 requests per minute
  'Too many authentication attempts, please try again later.'
);

const apiRateLimit = createRateLimit(
  1 * 60 * 1000, // 1 minute
  300, // 300 requests per minute
  'API rate limit exceeded, please slow down.'
);

// Request deduplication
const requestCache = new Map();
const REQUEST_CACHE_TTL = 5000; // 5 seconds

const deduplicationMiddleware = (req, res, next) => {
  // Only apply to GET requests
  if (req.method !== 'GET') {
    return next();
  }

  const key = `${req.method}:${req.originalUrl}:${JSON.stringify(req.query)}:${req.user?.userId || 'anonymous'}`;
  const now = Date.now();

  // Check if request is already in progress
  if (requestCache.has(key)) {
    const cached = requestCache.get(key);
    if (now - cached.timestamp < REQUEST_CACHE_TTL) {
      console.log(`Deduplicating request: ${key}`);
      return cached.promise;
    } else {
      requestCache.delete(key);
    }
  }

  // Store the promise for this request
  const originalJson = res.json;
  const requestPromise = new Promise((resolve) => {
    res.json = function(data) {
      originalJson.call(this, data);
      resolve(data);
    };
  });

  requestCache.set(key, {
    promise: requestPromise,
    timestamp: now
  });

  // Clean up after response
  requestPromise.finally(() => {
    setTimeout(() => {
      requestCache.delete(key);
    }, REQUEST_CACHE_TTL);
  });

  next();
};

// Performance monitoring middleware
const performanceMiddleware = (req, res, next) => {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const { method, originalUrl } = req;
    const { statusCode } = res;
    
    // Log slow requests
    if (duration > 1000) {
      console.warn(`Slow request: ${method} ${originalUrl} - ${duration}ms - ${statusCode}`);
    }
    
    // Log performance metrics
    console.log(`${method} ${originalUrl} - ${duration}ms - ${statusCode}`);
  });
  
  next();
};

// Database connection pooling optimization
const optimizeDatabase = (mongoose) => {
  // Set connection pool options
  mongoose.connection.on('connected', () => {
    console.log('MongoDB connected with optimized settings');
  });

  // Optimize connection pool
  const options = {
    maxPoolSize: 10, // Maintain up to 10 socket connections
    serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
    socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
    bufferMaxEntries: 0, // Disable mongoose buffering
    bufferCommands: false, // Disable mongoose buffering
  };

  return options;
};

// Memory usage monitoring
const memoryMonitor = () => {
  const used = process.memoryUsage();
  const formatBytes = (bytes) => {
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  };

  console.log('Memory Usage:', {
    rss: formatBytes(used.rss),
    heapTotal: formatBytes(used.heapTotal),
    heapUsed: formatBytes(used.heapUsed),
    external: formatBytes(used.external),
    arrayBuffers: formatBytes(used.arrayBuffers)
  });
};

// Run memory monitor every 5 minutes
setInterval(memoryMonitor, 5 * 60 * 1000);

module.exports = {
  compressionMiddleware,
  securityMiddleware,
  generalRateLimit,
  authRateLimit,
  apiRateLimit,
  deduplicationMiddleware,
  performanceMiddleware,
  optimizeDatabase,
  memoryMonitor
};
