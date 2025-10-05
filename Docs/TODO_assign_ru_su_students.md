# TODO: Add Assign to RU/SU Students Options

## Backend Changes
- [x] Add studentCategory field to User model (Backend/models/User.js)
- [x] Add /assign-ru and /assign-su routes in assignments.js (Backend/routes/assignments.js)
- [x] Update user creation/update validation in users.js (Backend/routes/users.js)

## Frontend Changes
- [x] Update CreateTest.jsx to add "ru" and "su" assignment modes (Frontend/src/pages/CreateTest.jsx)
- [x] Update Users.jsx to include studentCategory select for students (Frontend/src/pages/Users.jsx)
- [x] Update EmailUploader.jsx for bulk upload with studentCategory (Frontend/src/components/EmailUploader.jsx)

## Testing
- [ ] Test assignment options in test creation
- [ ] Test user creation/editing with student category
- [ ] Test bulk upload with student category
