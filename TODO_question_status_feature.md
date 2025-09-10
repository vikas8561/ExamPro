# TODO: Implement Question Status Feature (Not Answered, Mark for Review, Answered)

## Overview
Add functionality to track and manage question statuses during test taking, allowing students to mark questions for review and see clear visual indicators.

## Tasks
- [ ] Add questionStatuses state to track status of each question
- [ ] Initialize all questions as 'not-answered' when test starts
- [ ] Update status to 'answered' when answer is provided
- [ ] Add "Mark for Review" button to toggle review status
- [ ] Update navigation buttons with color coding for different statuses
- [ ] Add status legend/summary showing counts
- [ ] Update answer saving to include status information
- [ ] Test the feature with different scenarios

## Status Colors
- Not Answered: Gray (bg-slate-700)
- Answered: Green (bg-green-600)
- Mark for Review: Yellow/Orange (bg-yellow-600 or bg-orange-600)

## Implementation Details
- Status values: 'not-answered', 'answered', 'mark-for-review'
- Status should persist across page refreshes if possible
- Backend integration may be needed for status persistence
