# Fix Premature Score Visibility in Completed Tests

## Backend Changes
- [x] Update GET /test-submissions/student endpoint to filter submissions by deadline
- [x] Fix GET /test-submissions/assignment/:assignmentId showResults logic to only show after deadline

## Frontend Changes
- [x] Update StudentTable.jsx to hide scores before deadline (additional safeguard)

## Testing
- [ ] Test that scores are hidden before deadline
- [ ] Test that scores are shown after deadline
- [ ] Verify both completed tests list and detailed results page
