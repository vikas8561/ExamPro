# Tab Restriction Fix - Limit to 2 Tabs Total

## Task
Change tab monitoring logic to restrict to exactly 2 tabs total instead of allowing 2 tabs and cancelling on the 3rd.

## Files to Modify
- Frontend/src/pages/TakeTest.jsx

## Changes Needed
- Change condition from `if (tabCount > 2)` to `if (tabCount >= 2)`
- This will cancel the test immediately when a second tab is opened

## Steps
- [x] Analyze current implementation
- [x] Create plan
- [x] Modify TakeTest.jsx
- [x] Verify the change works correctly

## Current Status
✅ Fix implemented successfully - Tab monitoring now restricts to exactly 2 tabs total
