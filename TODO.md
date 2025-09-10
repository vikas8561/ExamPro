# TODO: Show Currently Assigned Test First in Student Assignments

## Steps to Complete:
- [x] Update filteredAssignments in StudentAssignments.jsx to sort assignments so that currently assigned tests appear first, then by date (newest first)
- [ ] Test the sorting functionality on the assignments page

## Details:
- Currently assigned tests: assignments with status "Assigned" or "In Progress" and test is active (not past deadline)
- Sort these to appear first, then other assignments sorted by startTime descending (newest first)
- Keep existing filters and search intact
- No backend changes needed
