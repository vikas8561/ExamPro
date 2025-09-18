import { useState, useEffect, useRef } from 'react';

// Simple in-memory cache for API responses
const cache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export const useApiCache = (url, options = {}) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const abortControllerRef = useRef(null);

  useEffect(() => {
    const fetchData = async () => {
      // Check cache first
      const cacheKey = `${url}-${JSON.stringify(options)}`;
      const cached = cache.get(cacheKey);
      
      if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        setData(cached.data);
        setLoading(false);
        return;
      }

      // Cancel previous request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      abortControllerRef.current = new AbortController();
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(url, {
          ...options,
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        
        // Cache the result
        cache.set(cacheKey, {
          data: result,
          timestamp: Date.now(),
        });

        setData(result);
      } catch (err) {
        if (err.name !== 'AbortError') {
          setError(err);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [url, JSON.stringify(options)]);

  const invalidateCache = () => {
    const cacheKey = `${url}-${JSON.stringify(options)}`;
    cache.delete(cacheKey);
  };

  return { data, loading, error, invalidateCache };
};

// Cache invalidation utility
export const invalidateApiCache = (pattern) => {
  for (const [key] of cache.entries()) {
    if (key.includes(pattern)) {
      cache.delete(key);
    }
  }
};
