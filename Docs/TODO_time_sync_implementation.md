# TODO: Implement Time Synchronization for Consistent Test Start

## Overview
Fix the issue where incorrect laptop time/timezone causes test scheduling problems by fetching accurate time from server and browser timezone.

## Steps
- [x] Create Backend/routes/time.js with /api/time endpoint returning server time and timezone
- [x] Add time route to Backend/server.js
- [x] Modify Frontend/src/pages/TakeTest.jsx to fetch server time before starting test
- [x] Replace client new Date() with server time for elapsed/remaining calculations
- [x] Add browser timezone detection using Intl API
- [ ] Test the implementation to ensure consistent timing

## Files to Edit
- Backend/routes/time.js (new)
- Backend/server.js
- Frontend/src/pages/TakeTest.jsx

## Dependent Files
None

## Followup Steps
- Test with different timezones
- Verify test starts at correct time for all users
- Handle network delays in time fetching
