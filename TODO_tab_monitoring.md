# Tab Monitoring Implementation Plan

## Phase 1: Database Schema Updates ✅ COMPLETED
- [x] Update Assignment model with violation tracking fields
- [x] Update TestSubmission model with violation data fields

## Phase 2: Backend API Implementation
- [ ] Add violation reporting endpoint in assignments.js
- [ ] Update test submission validation to check for violations
- [ ] Include violation data in mentor endpoints

## Phase 3: Frontend Tab Monitoring
- [ ] Implement tab/window detection in TakeTest.jsx
- [ ] Add violation reporting to backend
- [ ] Implement auto-cancellation on violation threshold

## Phase 4: Mentor View Updates
- [ ] Add violation display in MentorSubmissions.jsx
- [ ] Update mentor dashboard with violation statistics

## Phase 5: Testing and Validation
- [ ] Test tab detection across browsers
- [ ] Test cancellation flow
- [ ] Test mentor view updates
- [ ] Verify students cannot restart cancelled tests

## Current Status: Starting Phase 2 - Backend API Implementation
