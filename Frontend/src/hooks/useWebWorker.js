import { useEffect, useRef, useState } from 'react';

export const useWebWorker = (workerScript) => {
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const workerRef = useRef(null);

  useEffect(() => {
    // Create worker
    workerRef.current = new Worker(workerScript);

    // Handle messages from worker
    workerRef.current.onmessage = (event) => {
      setResult(event.data);
      setIsLoading(false);
    };

    // Handle errors from worker
    workerRef.current.onerror = (error) => {
      setError(error);
      setIsLoading(false);
    };

    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
      }
    };
  }, [workerScript]);

  const postMessage = (message) => {
    if (workerRef.current) {
      setIsLoading(true);
      setError(null);
      workerRef.current.postMessage(message);
    }
  };

  return { result, error, isLoading, postMessage };
};

// Web worker for data processing
export const createDataProcessorWorker = () => {
  const workerCode = `
    self.onmessage = function(e) {
      const { type, data } = e.data;
      
      switch (type) {
        case 'FILTER_ASSIGNMENTS':
          const filtered = data.assignments.filter(assignment => {
            const searchTerm = data.searchTerm.toLowerCase();
            return (
              assignment.testId?.title?.toLowerCase().includes(searchTerm) ||
              assignment.testId?.subject?.toLowerCase().includes(searchTerm) ||
              assignment.userId?.name?.toLowerCase().includes(searchTerm)
            );
          });
          self.postMessage({ type: 'FILTER_RESULT', data: filtered });
          break;
          
        case 'SORT_SUBMISSIONS':
          const sorted = [...data.submissions].sort((a, b) => {
            const scoreA = a.score || 0;
            const scoreB = b.score || 0;
            return data.direction === 'asc' ? scoreA - scoreB : scoreB - scoreA;
          });
          self.postMessage({ type: 'SORT_RESULT', data: sorted });
          break;
          
        case 'CALCULATE_STATS':
          const stats = {
            total: data.length,
            average: data.reduce((sum, item) => sum + (item.score || 0), 0) / data.length,
            highest: Math.max(...data.map(item => item.score || 0)),
            lowest: Math.min(...data.map(item => item.score || 0))
          };
          self.postMessage({ type: 'STATS_RESULT', data: stats });
          break;
          
        default:
          self.postMessage({ type: 'ERROR', data: 'Unknown operation' });
      }
    };
  `;

  const blob = new Blob([workerCode], { type: 'application/javascript' });
  return URL.createObjectURL(blob);
};
