// API service with authentication
import { API_BASE_URL } from '../config/api';
import { recordFromResponse, recordServerTime, serverNow, SERVER_TIME_HEADER } from '../utils/serverClock';
import { isTokenExpired, loginRedirectUrl, shouldRenewToken } from '../utils/authToken';

const clearSignIn = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  localStorage.removeItem('userId');
};

// Get auth token from localStorage
const getAuthToken = () => {
  const token = localStorage.getItem('token');
  if (!token) {
    console.warn('No auth token found in localStorage');
    return null;
  }

  // The server's clock, not the device's: a laptop 12 hours fast treated a
  // fresh 24-hour token as half spent.
  if (isTokenExpired(token, serverNow())) {
    console.warn('Auth token has expired');
    clearSignIn();
    return null;
  }

  return token;
};

/**
 * The sign-in has ended: send them to the login page, and back here after.
 *
 * An expired sign-in used to clear the token and carry on. On the exam page
 * that meant every autosave and heartbeat was refused while the page looked
 * perfectly normal, and the student only found out at Submit -- with everything
 * since the expiry unsaved. Now they are told at once and brought straight back
 * to the exam after signing in, where saved answers (and any the page could not
 * save, kept in this browser by utils/unsavedAnswers.js) are restored.
 */
let redirecting = false;
const endSignIn = (reason) => {
  clearSignIn();
  if (redirecting || window.location.pathname.startsWith('/login')) return;
  redirecting = true;
  window.location.href = loginRedirectUrl(reason, window.location);
};

/** Refusals from the auth middleware that mean "this sign-in is over". */
const signInEndedBy = (status, message) => {
  if (status === 401) return 'session_timeout';
  if (status === 403 && message === 'Invalid or expired token') return 'session_timeout';
  if (status === 403 && message === 'Invalid or expired session') return 'session_expired';
  return null;
};

/**
 * Swap the token for a fresh one when it is due (utils/authToken.js).
 *
 * One renewal at a time, shared by every request that needs it. A failed
 * renewal is not retried for a little while, and never blocks the request that
 * asked: the old token is still valid, and the next request tries again.
 */
let renewal = null;
let renewalFailedAt = 0;
const RENEWAL_RETRY_MS = 30 * 1000;

const ensureFreshToken = () => {
  const token = localStorage.getItem('token');
  if (!token || !shouldRenewToken(token, serverNow())) return Promise.resolve();
  if (renewal) return renewal;
  if (Date.now() - renewalFailedAt < RENEWAL_RETRY_MS) return Promise.resolve();

  renewal = (async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
        cache: 'no-cache',
      });
      if (response.ok) {
        const data = await response.json().catch(() => null);
        // Another tab may have signed in or renewed meanwhile; never overwrite
        // a token that is no longer the one this renewal started from.
        if (data?.token && localStorage.getItem('token') === token) {
          localStorage.setItem('token', data.token);
        }
      } else if (response.status !== 409) {
        // 409: another tab renewed it first and stored the new token.
        renewalFailedAt = Date.now();
      }
    } catch {
      renewalFailedAt = Date.now();
    } finally {
      renewal = null;
    }
  })();
  return renewal;
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
  await ensureFreshToken();
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
      // No `keepalive` here. It does NOT mean "reuse the TCP connection" -- the
      // browser already does that on its own. It means "let this request outlive
      // the page", and the Fetch spec caps such a request's body at 64 KiB: past
      // that the browser rejects it with `TypeError: Failed to fetch` before any
      // request is sent, which surfaced as a bogus "network error" when creating
      // a test with enough questions. Only unload-time beacons should set it (see
      // the handleUnload in TakeCodingTest.jsx), and only with a small body.
      cache: 'no-cache', // Don't cache to avoid stale data
      credentials: 'include', // Include credentials for CORS
    };
    
    console.log(`🌐 Starting fetch to ${endpoint} at ${new Date().toISOString()}`);
    let response;
    let sentPerf;
    let receivedPerf;
    try {
      sentPerf = performance.now();
      response = await fetch(url, optimizedConfig);
      receivedPerf = performance.now();
      // Every response carries the server's time; this keeps the shared clock
      // (utils/serverClock.js) synced without a request of its own.
      recordFromResponse(response, sentPerf, receivedPerf);
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
      endSignIn('session_timeout');
      const error = new Error('Authentication required - please log in again');
      error.status = 401;
      error.code = 'signed_out';
      throw error;
    }
    
    if (response.status === 403) {
      const errorData = await response.json().catch(() => ({}));

      // The sign-in ran out, or was replaced by one elsewhere: it is gone.
      const ended = signInEndedBy(403, errorData.message);
      if (ended) {
        endSignIn(ended);
        const error = new Error(
          ended === 'session_expired' ? 'Session expired due to new login' : 'Your sign-in has expired - please log in again'
        );
        error.status = 403;
        error.code = 'signed_out';
        throw error;
      }

      // Every other refusal keeps the server's own words and its code. This
      // used to replace them all with "Access forbidden", so a student told by
      // the server that the test had not started yet, or that proctoring had
      // ended their attempt, saw only that -- and no caller could branch on
      // `error.code` for a 403 at all.
      const error = new Error(errorData.message || 'Access forbidden');
      error.status = 403;
      if (errorData.code) error.code = errorData.code;
      if (errorData.reason) error.reason = errorData.reason;
      if (errorData.opensAt) error.opensAt = errorData.opensAt;
      throw error;
    }
    
    // Handle 404 responses - don't treat as errors for certain endpoints
    if (response.status === 404) {
      // For test submissions endpoint, 404 is expected when no submission exists
      if (endpoint.startsWith('/test-submissions/assignment/')) {
        // Return null instead of throwing error for expected 404s
        return null;
      }
      
      // For answers endpoint, 404 is expected when no answers exist yet
      if (endpoint.startsWith('/answers/assignment/')) {
        // Return empty array instead of throwing error for expected 404s
        return [];
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
      const error = new Error(errorData.message || `HTTP error! status: ${response.status}`);
      // Carry the machine-readable parts through. Callers that need to branch on
      // a specific failure should read `error.code`, never the message text --
      // the exam page's auto-submit backstop matched on prose and silently
      // stopped working when the wording drifted.
      error.status = response.status;
      if (errorData.code) error.code = errorData.code;
      // When the exam opens, for a "not_started" refusal, so the page can say so.
      if (errorData.opensAt) error.opensAt = errorData.opensAt;
      throw error;
    }
    
    const jsonStart = Date.now();
    const data = await response.json();
    const jsonTime = Date.now() - jsonStart;

    // A proxy that strips the header still leaves the time in the body of the
    // responses that matter (the card lists, the dashboard, the exam).
    if (!response.headers.get(SERVER_TIME_HEADER) && data && typeof data === 'object' && data.serverNow) {
      const ms = typeof data.serverNow === 'number' ? data.serverNow : Date.parse(data.serverNow);
      recordServerTime(ms, sentPerf, receivedPerf);
    }
    
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

/**
 * POST to an endpoint that replies with Server-Sent Events, calling `onEvent`
 * for each frame as it arrives. Used by code submission so the UI can show the
 * judge's real progress instead of a spinner with no information.
 *
 * EventSource cannot send an Authorization header, so this reads the stream
 * from fetch directly.
 *
 * @returns {Promise<void>} resolves when the stream ends
 */
export const apiStream = async (endpoint, { body, onEvent, signal } = {}) => {
  await ensureFreshToken();
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: { ...getAuthHeaders(), Accept: 'text/event-stream' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
    credentials: 'include',
    signal,
  });

  if (!response.ok || !response.body) {
    const errorData = await response.json().catch(() => ({}));
    const ended = signInEndedBy(response.status, errorData.message);
    if (ended) endSignIn(ended);
    const error = new Error(errorData.message || `HTTP error! status: ${response.status}`);
    error.status = response.status;
    if (errorData.code) error.code = errorData.code;
    throw error;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  // SSE frames are separated by a blank line.
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let split;
    while ((split = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, split);
      buffer = buffer.slice(split + 2);

      const event = frame.match(/^event: (.+)$/m)?.[1];
      const raw = frame.match(/^data: (.+)$/m)?.[1];
      if (!event || !raw) continue;
      try {
        onEvent?.(event, JSON.parse(raw));
      } catch {
        // Ignore malformed frames rather than aborting the stream.
      }
    }
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
};

export default apiRequest;
