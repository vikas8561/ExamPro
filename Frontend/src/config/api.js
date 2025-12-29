// API Configuration - reads from environment variable
// In Vite, environment variables must be prefixed with VITE_ to be accessible
// Auto-detect hostname for mobile access (use current hostname instead of localhost)
const getBackendUrl = () => {
  const envUrl = import.meta.env.VITE_BACKEND_URL || import.meta.env.BACKEND_URL;
  if (envUrl) return envUrl;
  
  // In development, use current hostname (works for both localhost and mobile access)
  const hostname = window.location.hostname;
  const port = '4000';
  return `http://${hostname}:${port}/api`;
};

const BACKEND_URL = getBackendUrl();

// Construct API base URL - ensure it includes /api if not already present
export const API_BASE_URL = BACKEND_URL.endsWith('/api') 
  ? BACKEND_URL 
  : BACKEND_URL.endsWith('/') 
    ? `${BACKEND_URL}api`
    : `${BACKEND_URL}/api`;

// Export base URL without /api for socket connections
// Socket.IO needs the base URL without /api path
let baseUrlForSocket = BACKEND_URL;
// Remove /api if it exists in the URL
if (baseUrlForSocket.includes('/api')) {
  // Remove /api and anything after it
  const apiIndex = baseUrlForSocket.indexOf('/api');
  baseUrlForSocket = baseUrlForSocket.substring(0, apiIndex);
}
// Remove trailing slash
if (baseUrlForSocket.endsWith('/')) {
  baseUrlForSocket = baseUrlForSocket.slice(0, -1);
}
export const BASE_URL = baseUrlForSocket;

// Log for debugging (remove in production if needed)
if (import.meta.env.DEV) {
  console.log('API Config - BACKEND_URL:', BACKEND_URL);
  console.log('API Config - API_BASE_URL:', API_BASE_URL);
  console.log('API Config - BASE_URL (for Socket.IO):', BASE_URL);
}


