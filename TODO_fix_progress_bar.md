# TODO: Fix Progress Bar Count Issue

## Problem
The "Answered" progress bar incorrectly decreases when marking an answered question for review or unmarking it. It should count questions with actual answers, regardless of mark-for-review status.

## Tasks
- [x] Update progress bar calculation in TakeTest.jsx to count based on `answers` object instead of `questionStatuses`
- [x] Modify "Mark for Review" button logic to preserve "answered" status when unmarking if question has an answer
- [ ] Test the changes to ensure progress bar behaves correctly

## Files to Edit
- Frontend/src/pages/TakeTest.jsx
