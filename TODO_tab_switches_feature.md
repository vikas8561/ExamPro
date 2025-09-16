# TODO: Implement Allowed Tab Switches Feature

## Tasks to Complete:

### 1. Backend Model Update
- [x] Add `allowedTabSwitches` field to Test.js model schema

### 2. Backend API Update
- [x] Update POST /tests route to accept and save `allowedTabSwitches`
- [x] Update PUT /tests/:id route to accept and update `allowedTabSwitches`

### 3. Frontend Form Update
- [x] Add `allowedTabSwitches` to CreateTest.jsx form state
- [x] Add input field for Allowed Tab Switches in the form
- [x] Include `allowedTabSwitches` in create/update payload

### 4. Testing
- [ ] Test creating a test with allowed tab switches
- [ ] Test editing a test to update allowed tab switches
- [ ] Verify the value is saved and loaded correctly
