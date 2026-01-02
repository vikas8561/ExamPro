// API service with authentication
import { API_BASE_URL } from '../config/api';

// Get auth token from localStorage
const getAuthToken = () => {
  const token = localStorage.getItem('token');
  if (!token) {
    console.warn('No auth token found in localStorage');
    return null;
  }
  
  // Check if token is expired (basic check)
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const currentTime = Date.now() / 1000;
    if (payload.exp && payload.exp < currentTime) {
      console.warn('Auth token has expired');
      // Clear expired token
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('userId');
      return null;
    }
  } catch (error) {
    console.warn('Invalid token format:', error);
    return null;
  }
  
  return token;
};

// Check if user is authenticated
const isAuthenticated = () => {
  const token = getAuthToken();
  const user = localStorage.getItem('user');
  return !!(token && user);
};

// Create headers with auth token
const getAuthHeaders = (contentType = 'application/json') => {
  const token = getAuthToken();
  const headers = {
    'Content-Type': contentType,
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  return headers;
};

// Generic API request function
const apiRequest = async (endpoint, options = {}) => {
  const url = `${API_BASE_URL}${endpoint}`;
  const config = {
    ...options,
    headers: {
      ...getAuthHeaders(),
      ...options.headers,
    },
  };

  // Add Content-Type header for POST/PUT/PATCH requests with body
  if (options.body && (options.method === 'POST' || options.method === 'PUT' || options.method === 'PATCH')) {
    config.headers['Content-Type'] = 'application/json';
  }

  try {
    const fetchStart = Date.now();
    
    // Add keep-alive and other performance optimizations
    // Increase timeout for assignment operations (60 seconds)
    const isAssignmentOperation = endpoint.includes('/assignments/assign-');
    const timeout = isAssignmentOperation ? 60000 : 30000; // 60s for assignments, 30s for others
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    const optimizedConfig = {
      ...config,
      signal: controller.signal,
      keepalive: true, // Keep connection alive for faster subsequent requests
      cache: 'no-cache', // Don't cache to avoid stale data
      credentials: 'include', // Include credentials for CORS
    };
    
    console.log(`🌐 Starting fetch to ${endpoint} at ${new Date().toISOString()}`);
    let response;
    try {
      response = await fetch(url, optimizedConfig);
      clearTimeout(timeoutId);
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout: Operation took longer than ${timeout/1000} seconds. Please try again.`);
      }
      throw error;
    }
    const fetchTime = Date.now() - fetchStart;
    
    console.log(`📥 Fetch completed in ${fetchTime}ms - Status: ${response.status}, Headers:`, {
      'content-type': response.headers.get('content-type'),
      'content-length': response.headers.get('content-length'),
      'x-response-time': response.headers.get('x-response-time'),
    });
    
    if (fetchTime > 1000) {
      console.warn(`⚠️ fetch() took ${fetchTime}ms for ${endpoint}`);
    }
    
    // Handle authentication errors
    if (response.status === 401) {
      // Clear potentially invalid token
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('userId');
      throw new Error('Authentication required - please log in again');
    }
    
    if (response.status === 403) {
      // Check if this is a session expiration due to new login
      try {
        const errorData = await response.json();
        if (errorData.message === 'Invalid or expired session') {
          // Clear local storage and redirect to login
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          localStorage.removeItem('userId');
          window.location.href = '/login?message=session_expired';
          throw new Error('Session expired due to new login');
        }
      } catch {
        // If we can't parse the error response, throw generic error
        throw new Error('Access forbidden');
      }
      throw new Error('Access forbidden');
    }
    
    // Handle 404 responses - don't treat as errors for certain endpoints
    if (response.status === 404) {
      // For test submissions endpoint, 404 is expected when no submission exists
      if (endpoint.startsWith('/test-submissions/assignment/')) {
        // Return null instead of throwing error for expected 404s
        return null;
      }
      
      // Try to get error message from response body
      try {
        const errorData = await response.json();
        throw new Error(errorData.message || `Resource not found`);
      } catch {
        throw new Error(`Resource not found`);
      }
    }
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
    }
    
    const jsonStart = Date.now();
    const data = await response.json();
    const jsonTime = Date.now() - jsonStart;
    
    if (jsonTime > 1000) {
      console.warn(`⚠️ response.json() took ${jsonTime}ms for ${endpoint}`);
    }
    
    const totalTime = Date.now() - fetchStart;
    if (totalTime > 2000) {
      console.warn(`⚠️ Total apiRequest took ${totalTime}ms for ${endpoint} (fetch: ${fetchTime}ms, json: ${jsonTime}ms)`);
    }
    
    return data;
  } catch (error) {
    // Don't log "Test already started" errors or 404 errors for test submissions to console as they are expected
    if (!error.message.includes("Test already started") && 
        !error.message.includes("Resource not found") && 
        !error.message.includes("404")) {
      console.error('API request failed:', error);
    }
    
    // Handle specific error types
    if (error.message.includes('Failed to fetch') || error.message.includes('ERR_FAILED')) {
      throw new Error('Network error: Unable to connect to server. Please check your internet connection and try again.');
    } else if (error.message.includes('CORS')) {
      throw new Error('CORS error: Cross-origin request blocked. Please contact support.');
    }
    
    throw error;
  }
};

// Specific API functions
export const testSubmissionsAPI = {
  // Get test submission details
  getTestSubmission: async (assignmentId) => {
    return apiRequest(`/test-submissions/assignment/${assignmentId}`);
  },
  
  // Submit test results
  submitTest: async (submissionData) => {
    return apiRequest('/test-submissions', {
      method: 'POST',
      body: JSON.stringify(submissionData),
    });
  },
};

// Auth API
export const authAPI = {
  login: async (credentials) => {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(credentials),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message);
    }

    return response.json();
  },

  forgotPassword: async (forgotPasswordData) => {
    const response = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(forgotPasswordData),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message);
    }

    return response.json();
  },

  resetPassword: async (resetData) => {
    const response = await fetch(`${API_BASE_URL}/auth/reset-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(resetData),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message);
    }

    return response.json();
  },

  verifyEmail: async (verifyData) => {
    const response = await fetch(`${API_BASE_URL}/auth/profile/verify-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(verifyData),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message);
    }

    return response.json();
  },

  verifyPassword: async (verifyData) => {
    const response = await fetch(`${API_BASE_URL}/auth/profile/verify-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(verifyData),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message);
    }

    return response.json();
  },
};

export default apiRequest;
