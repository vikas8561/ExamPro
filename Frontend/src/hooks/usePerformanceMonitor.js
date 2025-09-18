import { useEffect, useState, useCallback } from 'react';

export const usePerformanceMonitor = () => {
  const [metrics, setMetrics] = useState({
    fcp: null,
    lcp: null,
    fid: null,
    cls: null,
    ttfb: null
  });

  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    // Check if Performance Observer is supported
    if ('PerformanceObserver' in window) {
      setIsSupported(true);
      observeWebVitals();
    }
  }, []);

  const observeWebVitals = useCallback(() => {
    // First Contentful Paint
    if ('PerformanceObserver' in window) {
      const fcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const fcp = entries.find(entry => entry.name === 'first-contentful-paint');
        if (fcp) {
          setMetrics(prev => ({ ...prev, fcp: fcp.startTime }));
        }
      });
      fcpObserver.observe({ entryTypes: ['paint'] });

      // Largest Contentful Paint
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1];
        setMetrics(prev => ({ ...prev, lcp: lastEntry.startTime }));
      });
      lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });

      // First Input Delay
      const fidObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach(entry => {
          setMetrics(prev => ({ ...prev, fid: entry.processingStart - entry.startTime }));
        });
      });
      fidObserver.observe({ entryTypes: ['first-input'] });

      // Cumulative Layout Shift
      let clsValue = 0;
      const clsObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach(entry => {
          if (!entry.hadRecentInput) {
            clsValue += entry.value;
            setMetrics(prev => ({ ...prev, cls: clsValue }));
          }
        });
      });
      clsObserver.observe({ entryTypes: ['layout-shift'] });

      // Time to First Byte
      const navigationObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach(entry => {
          setMetrics(prev => ({ ...prev, ttfb: entry.responseStart - entry.requestStart }));
        });
      });
      navigationObserver.observe({ entryTypes: ['navigation'] });
    }
  }, []);

  const getPerformanceScore = useCallback(() => {
    const scores = {
      fcp: metrics.fcp < 1800 ? 'good' : metrics.fcp < 3000 ? 'needs-improvement' : 'poor',
      lcp: metrics.lcp < 2500 ? 'good' : metrics.lcp < 4000 ? 'needs-improvement' : 'poor',
      fid: metrics.fid < 100 ? 'good' : metrics.fid < 300 ? 'needs-improvement' : 'poor',
      cls: metrics.cls < 0.1 ? 'good' : metrics.cls < 0.25 ? 'needs-improvement' : 'poor'
    };

    const goodCount = Object.values(scores).filter(score => score === 'good').length;
    const totalCount = Object.keys(scores).length;
    
    return {
      overall: goodCount / totalCount,
      scores,
      grade: goodCount / totalCount >= 0.75 ? 'A' : 
             goodCount / totalCount >= 0.5 ? 'B' : 
             goodCount / totalCount >= 0.25 ? 'C' : 'D'
    };
  }, [metrics]);

  const logPerformanceMetrics = useCallback(() => {
    const score = getPerformanceScore();
    console.group('🚀 Performance Metrics');
    console.groupEnd();
  }, [metrics, getPerformanceScore]);

  return {
    metrics,
    isSupported,
    getPerformanceScore,
    logPerformanceMetrics
  };
};

// Hook for monitoring component render performance
export const useRenderPerformance = (componentName) => {
  const [renderTimes, setRenderTimes] = useState([]);
  const [isMonitoring, setIsMonitoring] = useState(false);

  useEffect(() => {
    if (!isMonitoring) return;

    const startTime = performance.now();
    
    return () => {
      const endTime = performance.now();
      const renderTime = endTime - startTime;
      
      setRenderTimes(prev => [...prev.slice(-9), renderTime]);
      
      if (renderTime > 16) { // More than one frame (16ms)
        console.warn(`Slow render in ${componentName}: ${renderTime.toFixed(2)}ms`);
      }
    };
  }, [componentName, isMonitoring]);

  const startMonitoring = useCallback(() => {
    setIsMonitoring(true);
  }, []);

  const stopMonitoring = useCallback(() => {
    setIsMonitoring(false);
  }, []);

  const getAverageRenderTime = useCallback(() => {
    if (renderTimes.length === 0) return 0;
    return renderTimes.reduce((sum, time) => sum + time, 0) / renderTimes.length;
  }, [renderTimes]);

  return {
    renderTimes,
    averageRenderTime: getAverageRenderTime(),
    startMonitoring,
    stopMonitoring
  };
};

// Hook for monitoring API performance
export const useApiPerformance = () => {
  const [apiMetrics, setApiMetrics] = useState([]);

  const trackApiCall = useCallback((url, startTime, endTime, success) => {
    const duration = endTime - startTime;
    const metric = {
      url,
      duration,
      success,
      timestamp: new Date().toISOString()
    };

    setApiMetrics(prev => [...prev.slice(-49), metric]);

    if (duration > 1000) {
      console.warn(`Slow API call: ${url} - ${duration.toFixed(2)}ms`);
    }
  }, []);

  const getAverageApiTime = useCallback(() => {
    if (apiMetrics.length === 0) return 0;
    return apiMetrics.reduce((sum, metric) => sum + metric.duration, 0) / apiMetrics.length;
  }, [apiMetrics]);

  const getSlowestApis = useCallback((limit = 5) => {
    return apiMetrics
      .sort((a, b) => b.duration - a.duration)
      .slice(0, limit);
  }, [apiMetrics]);

  return {
    apiMetrics,
    trackApiCall,
    getAverageApiTime,
    getSlowestApis
  };
};
