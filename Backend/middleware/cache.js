const NodeCache = require('node-cache');

// Create cache instance with 5 minute TTL
const cache = new NodeCache({ stdTTL: 300 });

// Cache middleware for GET requests
const cacheMiddleware = (duration = 300) => {
  return (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    const key = `${req.originalUrl}-${JSON.stringify(req.query)}-${req.user?.userId || 'anonymous'}`;
    
    // Check if data exists in cache
    const cachedData = cache.get(key);
    if (cachedData) {
      console.log(`Cache hit for key: ${key}`);
      return res.json(cachedData);
    }

    // Store original res.json method
    const originalJson = res.json;
    
    // Override res.json to cache the response
    res.json = function(data) {
      // Cache the response data
      cache.set(key, data, duration);
      console.log(`Cached data for key: ${key}`);
      
      // Call original json method
      originalJson.call(this, data);
    };

    next();
  };
};

// Cache invalidation utility
const invalidateCache = (pattern) => {
  const keys = cache.keys();
  const keysToDelete = keys.filter(key => key.includes(pattern));
  
  if (keysToDelete.length > 0) {
    cache.del(keysToDelete);
    console.log(`Invalidated ${keysToDelete.length} cache entries matching pattern: ${pattern}`);
  }
};

// Clear all cache
const clearAllCache = () => {
  cache.flushAll();
  console.log('All cache cleared');
};

module.exports = {
  cacheMiddleware,
  invalidateCache,
  clearAllCache,
  cache
};
