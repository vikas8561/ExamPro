# Single Session Implementation Plan

## Goal
Implement functionality where only one user can be logged in with a particular email account at any given time.

## Steps Completed ✓

### Backend Changes
1. [x] Modified User model to track active sessions - Added `activeSessions` array field
2. [x] Updated auth.js login endpoint to check for existing sessions - Clears existing sessions and adds new token
3. [x] Added session management to invalidate previous tokens - Authentication middleware now validates tokens against active sessions
4. [x] Created logout endpoint to clear sessions - Added `/logout` endpoint to remove tokens

### Frontend Changes
1. [x] Updated Login.jsx to handle session conflicts - Added error handling for session expiration
2. [x] Added session monitoring to detect when user is logged out elsewhere - Updated API service to redirect on session expiration

## Implementation Details

### Backend
- Added `activeSessions` field to User model to track JWT tokens
- During login, existing sessions are cleared and new token is added
- Authentication middleware validates tokens against active sessions in database
- Logout endpoint removes the specific token from active sessions

### Frontend
- API service detects session expiration (403 with specific message) and redirects to login
- Login page shows appropriate messages when session is terminated due to new login
- Added URL parameter handling for session expired messages
