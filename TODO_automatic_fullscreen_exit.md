# Automatic Fullscreen Exit Implementation

## Tasks
- [x] Add exitFullscreen function with cross-browser support
- [x] Call exitFullscreen in submitTest function before navigation
- [ ] Test fullscreen exit on test submission
- [ ] Test fullscreen exit when time runs out

## Details
- Location: Frontend/src/pages/TakeTest.jsx
- Function to add: exitFullscreen() - handles fullscreen exit with cross-browser support
- Modification: In submitTest(), call exitFullscreen() before navigate()
- This ensures fullscreen mode is automatically exited when test ends (submitted or time up)
