# OTP Implementation for Test Access

## Overview
Implement a 5-digit OTP feature that allows students to bypass camera/mic/location permission requirements during test taking. The OTP is unique per test and only visible to admins.

## Completed Tasks
- [x] Add `otp` field to Test model (Backend/models/Test.js)
- [x] Generate 5-digit OTP on test creation (Backend/routes/tests.js)
- [x] Add OTP input and verification in TakeTest permission modal (Frontend/src/pages/TakeTest.jsx)
- [x] Display OTP in admin Tests page (Frontend/src/pages/Tests.jsx)

## Testing Steps
- [ ] Create a new test and verify OTP is generated and displayed in admin view
- [ ] Assign test to a student
- [ ] As student, deny permissions and verify OTP input appears
- [ ] Enter correct OTP and verify test starts
- [ ] Enter incorrect OTP and verify error message
- [ ] Verify permissions are bypassed when OTP is used

## Notes
- OTP is generated using `Math.floor(10000 + Math.random() * 90000).toString()`
- OTP verification happens client-side by comparing input to `test.otp`
- Admin can view OTP in the Tests table
- If permissions are granted, OTP is not required
- If permissions are denied, OTP input is shown instead of permission request button
