# TODO: Implement Edit Answers and Recalculate Scores

## Overview
Add functionality to allow admin to edit test answers post-submission and automatically recalculate student scores.

## Tasks
- [x] Create a helper function in backend to recalculate scores for all submissions of a test
- [x] Update PUT /tests/:id route to trigger score recalculation after test update
- [x] Add workaround for TestSubmission validation errors
- [ ] Test the functionality by editing answers and verifying updated scores

## Files to Edit
- Backend/routes/tests.js
- Backend/models/TestSubmission.js (added fullscreen_exit to enum)
- Backend/services/scoreCalculation.js (added error handling)

## Followup
- Test with actual data
- Ensure no data loss during recalculation
