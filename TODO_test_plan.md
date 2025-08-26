# Test Plan for Redirect to Assigned Tests & View Result Button Logic

## 1. Test Submission Flow
- **Objective**: Verify that the user is redirected to the Assigned Tests page after submitting a test.
- **Steps**:
  1. Navigate to a test.
  2. Complete the test and submit it.
  3. Observe the redirection.
- **Expected Result**: User should be redirected to `/student/assignments`.

## 2. Test View Result Button Behavior
### Before Deadline
- **Objective**: Verify that the View Result button is disabled before the deadline.
- **Steps**:
  1. Navigate to a completed test before the deadline.
  2. Observe the View Result button.
- **Expected Result**: The button should be disabled with the message "Results Available After Deadline."

### After Deadline
- **Objective**: Verify that the View Result button is enabled after the deadline.
- **Steps**:
  1. Navigate to a completed test after the deadline.
  2. Observe the View Result button.
- **Expected Result**: The button should be enabled, allowing access to the results.

## 3. Test Result Access Control
- **Objective**: Ensure that results cannot be viewed before the deadline.
- **Steps**:
  1. Attempt to view results for a test before the deadline.
- **Expected Result**: The user should see a message indicating that results are not available yet.

## Current Status
- **Pending**: Testing to be conducted after implementation.
