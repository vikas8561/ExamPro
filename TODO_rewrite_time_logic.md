# TODO: Rewrite Time Limit and Duration Logic

## Requirements
1. Duration: Time Duration admin wants to give in which student can attempt the test (availability window)
2. Time limit: Time of the Test after time limit ends it should automatically submit
3. Duration must be >= Time Limit
4. If Duration > Time limit: Student starts test, time limit counter starts
5. If Duration == Time limit: Timer should start automatically when assignment becomes available

## Changes Needed

### Frontend (TakeTest.jsx)
- [x] Always use test.timeLimit as timer duration
- [x] Calculate remaining time as (startedAt + timeLimit) - current time
- [x] If duration == timeLimit and current time >= startTime and not started: auto-start test
- [x] Remove condition checking if duration > timeLimit

### Backend (assignments.js)
- [x] Update check-expiration to check both availability window AND test time limit
- [x] Add validation in assignment creation: duration >= test.timeLimit
- [x] If duration == timeLimit: when checking assignment, if now >= startTime and status=Assigned, auto-start

### Testing
- [x] Testing skipped by user request - changes implemented and ready for manual testing
