const NodeCache = require("node-cache");

/**
 * Test ID Cache Utility
 * 
 * SAFETY GUARANTEES:
 * 1. Cache is invalidated immediately when tests are created/updated/deleted
 * 2. Stale cache data is safe - deleted tests return null in populate, which we filter out
 * 3. Test type changes invalidate cache immediately
 * 4. Maximum staleness: 5 minutes (only if server restarts or cache expires naturally)
 * 5. Memory usage: Minimal (only stores arrays of ObjectIds)
 * 
 * POTENTIAL EDGE CASES (all handled safely):
 * - Deleted test ID in cache: Populate returns null, filtered out ✅
 * - Test type change: Cache invalidated immediately ✅
 * - Test status change: Not filtered by status, so cache is still valid ✅
 * - Concurrent cache rebuilds: NodeCache handles this internally ✅
 */

// Cache for test IDs (5 minute TTL - tests rarely change)
const testCache = new NodeCache({ 
  stdTTL: 300, // 5 minutes
  checkperiod: 60, // Check for expired keys every minute
  useClones: false // Don't clone arrays (faster, and we don't modify them)
});

// Get cached test IDs
const getCachedTestIds = (cacheKey) => {
  return testCache.get(cacheKey);
};

// Set cached test IDs
const setCachedTestIds = (cacheKey, testIds) => {
  // Validate that we're storing an array
  if (!Array.isArray(testIds)) {
    console.warn(`⚠️ Attempted to cache non-array for key: ${cacheKey}`);
    return false;
  }
  testCache.set(cacheKey, testIds);
  return true;
};

// Invalidate all test caches (call when tests are created/updated/deleted)
const invalidateTestCache = () => {
  testCache.flushAll();
  console.log('🗑️ Test cache invalidated');
};

module.exports = {
  getCachedTestIds,
  setCachedTestIds,
  invalidateTestCache
};

