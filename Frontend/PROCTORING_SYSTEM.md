# Proctoring System Documentation

## Overview

The new proctoring system provides comprehensive monitoring and security features for online exams. It includes screen sharing, face recognition, microphone monitoring, location tracking, and various violation detection mechanisms.

## Features

### 1. Permission Requirements

Before starting any test, students must grant the following permissions:

- **Screen Sharing**: Monitors the entire screen during the exam
- **Face Recognition**: Uses face-api.js to verify the student's identity and detect face changes
- **Microphone**: Audio monitoring during the exam
- **Location**: Geolocation tracking for exam security

### 2. Monitoring Features

- **Screen Sharing Monitoring**: Detects if screen sharing is stopped
- **Face Matching**: Continuously verifies the student's face matches the initial capture
- **Tab Switch Detection**: Detects when the student switches tabs or minimizes the window
- **Fullscreen Enforcement**: Ensures the exam is taken in fullscreen mode
- **Copy/Paste Blocking**: Prevents copying and pasting during the exam
- **DevTools Detection**: Detects if developer tools are opened
- **Keyboard Shortcuts Blocking**: Blocks F12, Ctrl+Shift+I, Ctrl+Shift+J, and other shortcuts

### 3. Warning System

The system implements a configurable warning system based on the **Allowed Tab Switches** setting configured by the admin when creating the test:

- **First Violation**: Warning message displayed
- **At Limit**: Final warning message displayed (when reaching the allowed limit)
- **Exceeding Limit**: Test is automatically submitted (when violations exceed the allowed limit)

**Note**: 
- The violation limit is set by the admin in the "Allowed Tab Switches" field when creating a test (0-100)
- Default limit is 2 if not specified
- Practice tests (with -1 value) allow unlimited violations but still show warnings

## Setup Instructions

### 1. Face-API.js Models

The face recognition feature requires face-api.js models to be downloaded and placed in the `public/models` directory.

#### Quick Setup (Windows PowerShell)

```powershell
cd Frontend/public/models
.\download-models.ps1
```

#### Quick Setup (Linux/Mac)

```bash
cd Frontend/public/models
chmod +x download-models.sh
./download-models.sh
```

#### Manual Setup

1. Navigate to `Frontend/public/models/`
2. Download the following files from https://github.com/justadudewhohacks/face-api.js/tree/master/weights:
   - `tiny_face_detector_model-weights_manifest.json`
   - `tiny_face_detector_model-shard1`
   - `face_landmark_68_model-weights_manifest.json`
   - `face_landmark_68_model-shard1`
   - `face_recognition_model-weights_manifest.json`
   - `face_recognition_model-shard1`

### 2. Component Usage

The proctoring component is automatically integrated into:
- `TakeTest.jsx` (Assigned Tests)
- `TakeCodingTest.jsx` (Coding Tests)

It activates automatically when a test starts (both new tests and continuing tests).

## How It Works

### Permission Modal Flow

1. When a test starts, the permission modal appears
2. Student must grant all required permissions:
   - Click "Grant Permission" for each permission type
   - Check the consent checkbox
3. Once all permissions are granted, click "Continue to Exam"
4. The modal closes and the exam begins with full monitoring

### Monitoring During Exam

- **Screen Sharing**: Continuously monitors if sharing is active
- **Face Detection**: Checks every 3 seconds to verify face matches
- **Tab Switch**: Detects immediately when tab is switched
- **Fullscreen**: Monitors fullscreen state and auto-requests if exited
- **DevTools**: Checks every 1 second for developer tools

### Violation Handling

When a violation is detected:
1. Violation is logged with timestamp and details
2. Warning modal appears based on violation count
3. After 3 violations, test is automatically submitted

## Browser Compatibility

### Required Browser Features

- **Screen Sharing API**: `navigator.mediaDevices.getDisplayMedia()` (Chrome 72+, Firefox 66+, Edge 79+)
- **Webcam API**: `navigator.mediaDevices.getUserMedia()` (All modern browsers)
- **Geolocation API**: `navigator.geolocation` (All modern browsers)
- **Fullscreen API**: `document.requestFullscreen()` (All modern browsers)

### Recommended Browsers

- Chrome 72+ (Recommended)
- Firefox 66+
- Edge 79+
- Safari 13+ (with limitations)

## Important Notes

1. **Screen Sharing**: Students must explicitly grant permission - browsers cannot capture screen secretly
2. **Face Recognition**: Requires good lighting and clear face visibility
3. **Location**: May require HTTPS for geolocation API to work
4. **Privacy**: All monitoring is disclosed to students via the consent checkbox

## Troubleshooting

### Face Recognition Not Working

- Ensure face-api.js models are downloaded and in `public/models/`
- Check browser console for model loading errors
- Verify webcam permissions are granted
- Ensure good lighting and clear face visibility

### Screen Sharing Not Working

- Check browser compatibility
- Ensure HTTPS (required for screen sharing in some browsers)
- Verify browser permissions are not blocked

### Location Not Working

- HTTPS is required for geolocation API
- Check browser location permissions
- Some browsers may require user interaction before requesting location

## Security Considerations

1. **Client-Side Monitoring**: All monitoring happens client-side
2. **Server Logging**: Violations are logged and sent to the server
3. **Auto-Submit**: Test automatically submits after 3 violations
4. **No Silent Recording**: All permissions require explicit user consent

## Future Enhancements

Potential improvements:
- Server-side screen recording storage
- Advanced face recognition with profile image matching
- Real-time violation alerts to administrators
- Network activity monitoring
- Application switching detection

