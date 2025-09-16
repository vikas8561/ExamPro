# TODO: Implement Edit Answers and Recalculate Scores

## Overview
Add functionality to allow admin to edit test answers post-submission and automatically recalculate student scores.

## Tasks
- [x] Create a helper function in backend to recalculate scores for all submissions of a test
- [x] Update PUT /tests/:id route to trigger score recalculation after test update
- [x] Review and verify the edit functionality code logic

## Files to Edit
- Backend/routes/tests.js
- Backend/models/TestSubmission.js (if needed for recalculation logic)
- Backend/services/scoreCalculation.js (new service file for score calculation)

## Followup
- Test with actual data
- Ensure no data loss during recalculation
