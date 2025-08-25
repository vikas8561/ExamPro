// API service with authentication
const API_BASE_URL = 'http://localhost:4000/api';

// Get auth token from localStorage
const getAuthToken = () => {
  return localStorage.getItem('token');
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

  try {
    const response = await fetch(url, config);
    
    // Handle authentication errors
    if (response.status === 401) {
      // Don't auto-logout, just throw error
      throw new Error('Authentication required');
    }
    
    if (response.status === 403) {
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
    
    return await response.json();
  } catch (error) {
    // Don't log "Test already started" errors or 404 errors for test submissions to console as they are expected
    if (!error.message.includes("Test already started") && 
        !error.message.includes("Resource not found") && 
        !error.message.includes("404")) {
      console.error('API request failed:', error);
    }
    throw error;
  }
};

// Specific API functions
export const testSubmissionsAPI = {
  // Get test submission details
  getTestSubmission: async (assignmentId) => {
    return apiRequest(`/test-submissions/${assignmentId}`);
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
};

export default apiRequest;
