const redis = require('redis');

// Redis client configuration
const redisClient = redis.createClient({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  retry_strategy: (options) => {
    if (options.error && options.error.code === 'ECONNREFUSED') {
      // console.log('Redis server connection refused, falling back to memory cache');
      return undefined;
    }
    if (options.total_retry_time > 1000 * 60 * 60) {
      // console.log('Redis retry time exhausted');
      return new Error('Retry time exhausted');
    }
    if (options.attempt > 10) {
      // console.log('Redis max retry attempts reached');
      return undefined;
    }
    return Math.min(options.attempt * 100, 3000);
  }
});

// Fallback to in-memory cache if Redis fails
const memoryCache = new Map();
const CACHE_TTL = 300; // 5 minutes

// Initialize Redis connection
redisClient.on('connect', () => {
  // console.log('Redis client connected');
});

redisClient.on('error', (err) => {
  // console.log('Redis client error:', err);
});

redisClient.on('end', () => {
  // console.log('Redis client disconnected');
});

// Cache middleware with Redis and fallback
const redisCacheMiddleware = (duration = 300) => {
  return async (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    const key = `exampro:${req.originalUrl}:${JSON.stringify(req.query)}:${req.user?.userId || 'anonymous'}`;
    
    try {
      // Try Redis first
      const cachedData = await redisClient.get(key);
      if (cachedData) {
        // console.log(`Redis cache hit for key: ${key}`);
        return res.json(JSON.parse(cachedData));
      }
    } catch (error) {
      // console.log('Redis error, trying memory cache:', error.message);
      
      // Fallback to memory cache
      const memoryCached = memoryCache.get(key);
      if (memoryCached && Date.now() - memoryCached.timestamp < memoryCached.ttl * 1000) {
        // console.log(`Memory cache hit for key: ${key}`);
        return res.json(memoryCached.data);
      }
    }

    // Store original res.json method
    const originalJson = res.json;
    
    // Override res.json to cache the response
    res.json = function(data) {
      const cacheData = {
        data,
        timestamp: Date.now(),
        ttl: duration
      };

      // Try to cache in Redis
      try {
        redisClient.setex(key, duration, JSON.stringify(data));
        // console.log(`Cached in Redis: ${key}`);
      } catch (error) {
        // console.log('Redis cache failed, using memory cache:', error.message);
        // Fallback to memory cache
        memoryCache.set(key, cacheData);
        // console.log(`Cached in memory: ${key}`);
      }
      
      // Call original json method
      originalJson.call(this, data);
    };

    next();
  };
};

// Cache invalidation
const invalidateRedisCache = async (pattern) => {
  try {
    const keys = await redisClient.keys(`exampro:${pattern}*`);
    if (keys.length > 0) {
      await redisClient.del(keys);
      // console.log(`Invalidated ${keys.length} Redis cache entries matching pattern: ${pattern}`);
    }
  } catch (error) {
    // console.log('Redis invalidation error:', error.message);
  }

  // Also invalidate memory cache
  const memoryKeys = Array.from(memoryCache.keys());
  const keysToDelete = memoryKeys.filter(key => key.includes(pattern));
  keysToDelete.forEach(key => memoryCache.delete(key));
  
  if (keysToDelete.length > 0) {
    // console.log(`Invalidated ${keysToDelete.length} memory cache entries matching pattern: ${pattern}`);
  }
};

// Clear all cache
const clearAllRedisCache = async () => {
  try {
    await redisClient.flushdb();
    // console.log('All Redis cache cleared');
  } catch (error) {
    // console.log('Redis clear error:', error.message);
  }
  
  memoryCache.clear();
  // console.log('All memory cache cleared');
};

// Get cache statistics
const getCacheStats = async () => {
  try {
    const redisInfo = await redisClient.info('memory');
    const memoryKeys = memoryCache.size;
    
    return {
      redis: {
        connected: redisClient.connected,
        info: redisInfo
      },
      memory: {
        keys: memoryKeys
      }
    };
  } catch (error) {
    return {
      redis: {
        connected: false,
        error: error.message
      },
      memory: {
        keys: memoryCache.size
      }
    };
  }
};

module.exports = {
  redisClient,
  redisCacheMiddleware,
  invalidateRedisCache,
  clearAllRedisCache,
  getCacheStats
};
