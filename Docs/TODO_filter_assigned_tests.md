# TODO: Implement Filter Functionality in Student Assignments Section

## Steps to Complete:
- [ ] Add filter state variables (statusFilter, typeFilter, mentorFilter)
- [ ] Add filter dropdown UI elements above the assignments grid
- [ ] Implement filtering logic combining search and filters
- [ ] Update the assignments display to use combined filtered results
- [ ] Add "Clear Filters" functionality
- [ ] Test the filter functionality with existing search

## Details:
- Filters should work alongside existing search
- Status filter: All, Assigned, In Progress, Completed, Overdue
- Type filter: All, Quiz, Exam, etc. (based on test.type)
- Mentor filter: All, specific mentors
- Client-side filtering since API doesn't support filters for students
- Preserve existing search functionality
