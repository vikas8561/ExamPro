# TODO: Automatic Test Ending Implementation

## Frontend Changes
- [x] Update `TakeTest.jsx` to ensure the timer triggers `submitTest()` when time runs out.
- [x] Modify `TakeTest.jsx` to start timer only when assignment.duration > test.timeLimit, using assignment.duration as timer limit.

## Backend Changes
- [ ] Ensure the `/check-expiration/:id` endpoint is functioning correctly to check if the test time has expired.

## Testing
- [ ] Test the automatic submission functionality to ensure it works as expected when the time limit is reached.
