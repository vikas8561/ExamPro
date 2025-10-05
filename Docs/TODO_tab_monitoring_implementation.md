# Tab Monitoring Implementation Plan

## Tasks to Complete:

### 1. Frontend Changes (TakeTest.jsx)
- [ ] Add violationCount state to track violations
- [ ] Add showResumeModal state for resume option
- [ ] Add violations array to store detailed violation data
- [ ] Modify tab monitoring to allow 2 violations before cancellation
- [ ] Implement resume modal component
- [ ] Update submission to send detailed violation data

### 2. Backend Changes (testSubmissions.js)
- [ ] Update submission endpoint to handle violation data
- [ ] Store detailed violation information in database
- [ ] Update tabViolationCount field
- [ ] Set cancelledDueToViolation flag appropriately

### 3. Mentor View Changes (MentorSubmissions.jsx)
- [ ] Add tab violation display in review modal
- [ ] Show violation count and details
- [ ] Add visual indicators for violation severity

### 4. Testing
- [ ] Test violation flow (1st: resume, 2nd: resume, 3rd: cancel)
- [ ] Verify mentor can see violation details
- [ ] Test backward compatibility

## Implementation Notes:
- Current tab monitoring cancels immediately on 2nd tab
- New requirement: Allow 2 violations with resume option, cancel on 3rd
- Mentor should see all violation details
