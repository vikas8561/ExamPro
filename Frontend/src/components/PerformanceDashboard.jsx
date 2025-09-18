import React, { useState, useEffect } from 'react';
import { usePerformanceMonitor, useRenderPerformance, useApiPerformance } from '../hooks/usePerformanceMonitor';

const PerformanceDashboard = () => {
  const { metrics, isSupported, getPerformanceScore, logPerformanceMetrics } = usePerformanceMonitor();
  const { renderTimes, averageRenderTime, startMonitoring, stopMonitoring } = useRenderPerformance('PerformanceDashboard');
  const { apiMetrics, getAverageApiTime, getSlowestApis } = useApiPerformance();
  
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(null);

  useEffect(() => {
    if (isMonitoring) {
      startMonitoring();
      const interval = setInterval(() => {
        logPerformanceMetrics();
      }, 5000);
      setRefreshInterval(interval);
    } else {
      stopMonitoring();
      if (refreshInterval) {
        clearInterval(refreshInterval);
        setRefreshInterval(null);
      }
    }

    return () => {
      if (refreshInterval) {
        clearInterval(refreshInterval);
      }
    };
  }, [isMonitoring, startMonitoring, stopMonitoring, logPerformanceMetrics]);

  const score = getPerformanceScore();
  const averageApiTime = getAverageApiTime();
  const slowestApis = getSlowestApis(3);

  const getScoreColor = (score) => {
    if (score >= 0.75) return 'text-green-400';
    if (score >= 0.5) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getScoreBgColor = (score) => {
    if (score >= 0.75) return 'bg-green-900/20';
    if (score >= 0.5) return 'bg-yellow-900/20';
    return 'bg-red-900/20';
  };

  if (!isSupported) {
    return (
      <div className="p-6 bg-slate-800 rounded-lg">
        <h3 className="text-lg font-semibold text-white mb-4">Performance Dashboard</h3>
        <p className="text-slate-400">Performance monitoring is not supported in this browser.</p>
      </div>
    );
  }

  return (
    <div className="p-6 bg-slate-800 rounded-lg space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-white">Performance Dashboard</h3>
        <button
          onClick={() => setIsMonitoring(!isMonitoring)}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            isMonitoring 
              ? 'bg-red-600 hover:bg-red-700 text-white' 
              : 'bg-green-600 hover:bg-green-700 text-white'
          }`}
        >
          {isMonitoring ? 'Stop Monitoring' : 'Start Monitoring'}
        </button>
      </div>

      {/* Overall Score */}
      <div className={`p-4 rounded-lg ${getScoreBgColor(score.overall)}`}>
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-white font-semibold">Overall Performance Score</h4>
            <p className="text-slate-400 text-sm">Based on Core Web Vitals</p>
          </div>
          <div className="text-right">
            <div className={`text-3xl font-bold ${getScoreColor(score.overall)}`}>
              {score.grade}
            </div>
            <div className="text-slate-400 text-sm">
              {(score.overall * 100).toFixed(1)}%
            </div>
          </div>
        </div>
      </div>

      {/* Core Web Vitals */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-700 p-4 rounded-lg">
          <h5 className="text-white font-medium mb-2">First Contentful Paint</h5>
          <div className={`text-2xl font-bold ${getScoreColor(score.scores.fcp)}`}>
            {metrics.fcp ? `${metrics.fcp.toFixed(0)}ms` : 'N/A'}
          </div>
          <div className="text-slate-400 text-sm capitalize">
            {score.scores.fcp}
          </div>
        </div>

        <div className="bg-slate-700 p-4 rounded-lg">
          <h5 className="text-white font-medium mb-2">Largest Contentful Paint</h5>
          <div className={`text-2xl font-bold ${getScoreColor(score.scores.lcp)}`}>
            {metrics.lcp ? `${metrics.lcp.toFixed(0)}ms` : 'N/A'}
          </div>
          <div className="text-slate-400 text-sm capitalize">
            {score.scores.lcp}
          </div>
        </div>

        <div className="bg-slate-700 p-4 rounded-lg">
          <h5 className="text-white font-medium mb-2">First Input Delay</h5>
          <div className={`text-2xl font-bold ${getScoreColor(score.scores.fid)}`}>
            {metrics.fid ? `${metrics.fid.toFixed(0)}ms` : 'N/A'}
          </div>
          <div className="text-slate-400 text-sm capitalize">
            {score.scores.fid}
          </div>
        </div>

        <div className="bg-slate-700 p-4 rounded-lg">
          <h5 className="text-white font-medium mb-2">Cumulative Layout Shift</h5>
          <div className={`text-2xl font-bold ${getScoreColor(score.scores.cls)}`}>
            {metrics.cls ? metrics.cls.toFixed(3) : 'N/A'}
          </div>
          <div className="text-slate-400 text-sm capitalize">
            {score.scores.cls}
          </div>
        </div>
      </div>

      {/* Additional Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-slate-700 p-4 rounded-lg">
          <h5 className="text-white font-medium mb-2">Component Render Performance</h5>
          <div className="text-2xl font-bold text-blue-400">
            {averageRenderTime.toFixed(2)}ms
          </div>
          <div className="text-slate-400 text-sm">
            Average render time
          </div>
          {renderTimes.length > 0 && (
            <div className="mt-2 text-xs text-slate-500">
              Last {renderTimes.length} renders: {renderTimes.map(t => t.toFixed(1)).join(', ')}ms
            </div>
          )}
        </div>

        <div className="bg-slate-700 p-4 rounded-lg">
          <h5 className="text-white font-medium mb-2">API Performance</h5>
          <div className="text-2xl font-bold text-purple-400">
            {averageApiTime.toFixed(0)}ms
          </div>
          <div className="text-slate-400 text-sm">
            Average API response time
          </div>
          {apiMetrics.length > 0 && (
            <div className="mt-2 text-xs text-slate-500">
              {apiMetrics.length} API calls tracked
            </div>
          )}
        </div>
      </div>

      {/* Slowest APIs */}
      {slowestApis.length > 0 && (
        <div className="bg-slate-700 p-4 rounded-lg">
          <h5 className="text-white font-medium mb-3">Slowest API Calls</h5>
          <div className="space-y-2">
            {slowestApis.map((api, index) => (
              <div key={index} className="flex justify-between items-center text-sm">
                <span className="text-slate-300 truncate flex-1 mr-2">
                  {api.url}
                </span>
                <span className={`font-medium ${
                  api.duration > 1000 ? 'text-red-400' : 
                  api.duration > 500 ? 'text-yellow-400' : 'text-green-400'
                }`}>
                  {api.duration.toFixed(0)}ms
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Performance Tips */}
      <div className="bg-slate-700 p-4 rounded-lg">
        <h5 className="text-white font-medium mb-3">Performance Tips</h5>
        <div className="space-y-2 text-sm text-slate-300">
          {score.scores.fcp === 'poor' && (
            <div>• Optimize critical rendering path and reduce server response time</div>
          )}
          {score.scores.lcp === 'poor' && (
            <div>• Optimize images and reduce largest contentful paint element size</div>
          )}
          {score.scores.fid === 'poor' && (
            <div>• Reduce JavaScript execution time and optimize event handlers</div>
          )}
          {score.scores.cls === 'poor' && (
            <div>• Reserve space for images and avoid inserting content above existing content</div>
          )}
          {averageApiTime > 1000 && (
            <div>• Consider implementing API caching and optimizing database queries</div>
          )}
          {averageRenderTime > 16 && (
            <div>• Optimize React components with memoization and reduce unnecessary re-renders</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PerformanceDashboard;
