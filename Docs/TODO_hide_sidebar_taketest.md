# TODO: Hide Sidebar on TakeTest Page

## Steps to Complete
- [x] Modify StudentRoutes component in App.jsx to conditionally hide sidebar when on TakeTest route
- [x] Import useLocation from react-router-dom in App.jsx
- [x] Get current pathname and check if it includes '/take-test'
- [x] Conditionally render the StudentSidebar and mobile header based on the route
- [x] Adjust main content area to take full width when sidebar is hidden
- [x] Test the implementation to ensure sidebar is hidden on TakeTest and visible on other pages (skipped by user)

## Information Gathered
- TakeTest.jsx renders the test interface but is wrapped by StudentRoutes component in App.jsx
- StudentRoutes component includes StudentSidebar and the main content area with routes
- The sidebar needs to be hidden specifically when the route matches TakeTest (/student/take-test/:assignmentId)
- Other student pages should continue to show the sidebar

## Plan
- Edit StudentRoutes component in App.jsx to detect the current route using useLocation
- If the pathname includes '/take-test', do not render the StudentSidebar component
- Adjust the main content area to take full width when sidebar is hidden
- This will make the test screen take the full width of the page

## Dependent Files
- Frontend/src/App.jsx (primary file to edit)

## Followup Steps
- Test navigation to TakeTest page to verify sidebar is hidden
- Test other student pages to ensure sidebar remains visible
- Verify test screen occupies full screen width when sidebar is hidden
