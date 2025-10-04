# TODO: Fix Coding Tests Display Issue

## Problem
When admin assigns a coding test, it shows in "Assigned Tests section" on student portal, but the user wants it to show only in "Coding Tests section".

## Solution
- Modify StudentAssignments.jsx to exclude coding tests from the displayed assignments.
- Modify StudentCodingTests.jsx to fetch assigned coding tests instead of all coding tests.

## Changes Made
- [x] Updated StudentAssignments.jsx to filter out assignments where testId.type === 'coding'
- [x] Updated StudentCodingTests.jsx to fetch from /assignments/student and filter for coding type
- [x] Updated the display and navigation in StudentCodingTests to use assignment.testId properties

## Testing
- Verify that coding assignments appear only in Coding Tests section
- Verify that Assigned Tests section excludes coding tests
- Verify that dashboard counts exclude coding tests
- Verify that navigation to take-coding works with testId
