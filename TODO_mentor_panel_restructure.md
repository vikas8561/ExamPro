# Mentor Panel Restructure Plan

## Objective
Remove test checking functionality and focus on student profiles and submissions.

## Steps to Complete:

### 1. Update Mentor Dashboard (MentorDashboard.jsx)
- [ ] Remove test monitoring statistics
- [ ] Focus on student submission overview
- [ ] Remove "Monitor" links and active tests section

### 2. Update Mentor Submissions (MentorSubmissions.jsx)
- [ ] Remove review functionality (mentor scoring and feedback)
- [ ] Transform into student profile view
- [ ] Show all student submissions with detailed test information
- [ ] Add student profile details

### 3. Update Mentor Assignments (MentorAssignments.jsx)
- [ ] Remove "Monitor" and "View Results" actions
- [ ] Focus on assignment listing only

### 4. Update Mentor Layout (MentorLayout.jsx)
- [ ] Update navigation labels if needed
- [ ] Ensure proper routing

### 5. Update App.jsx Routing
- [ ] Remove any unused mentor routes
- [ ] Ensure proper navigation structure

### 6. Backend Updates (if needed)
- [ ] Check if backend API endpoints need modification
- [ ] Remove mentor review functionality from backend

## Current Progress:
- Plan created and approved
- Starting implementation
