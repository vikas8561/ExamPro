# TODO: Fix Test Results Display for Incomplete Tests

## Objective
Allow students to see questions with correct answers even if they didn't answer any questions.

## Steps to Complete

### Backend Changes (testSubmissions.js)
1. [ ] Modify the GET /assignment/:assignmentId route to handle cases where no submission exists
2. [ ] Ensure that when no submission is found, the API still returns the test questions with correct answers
3. [ ] Update the response structure to include correct answers for all questions

### Frontend Changes (ViewTestResults.jsx)
1. [ ] Update the component to handle cases where no submission data exists
2. [ ] Ensure that questions are displayed with correct answers even when no responses were submitted
3. [ ] Modify the UI to show "Not answered" for questions without responses

## Current Status
- [ ] Backend changes implemented
- [ ] Frontend changes implemented
- [ ] Testing completed
