# Permission System Update

## Overview

The test permission system has been updated to provide better user experience and enhanced security through face recognition verification.

## Changes Made

### 1. Individual Permission Buttons

Previously, all permissions were requested at once when clicking "Request Permissions". Now, each permission has its own button:

- **Capture Image** (Orange button) - Requests camera permission and performs face verification
- **Enable Microphone** (Orange button) - Requests microphone permission only
- **Enable Location** (Orange button) - Requests location permission only

### 2. Face Recognition Verification

When a user clicks "Capture Image":
1. Camera permission is requested
2. A modal opens showing live camera feed
3. User clicks "Capture & Verify"
4. Image is captured and sent to backend
5. Backend calls Python face recognition service
6. Service compares captured face with user's profile image
7. If faces match (similarity >= 60%), camera permission is granted
8. If faces don't match, user must try again

### 3. Test Start Requirements

The test can **only** start when:
- ✅ Camera permission is granted AND face is verified
- ✅ Microphone permission is granted
- ✅ Location permission is granted

All three permissions must be enabled before the "Start Test" button becomes available.

## Files Modified

### Frontend
- `Frontend/src/pages/TakeTest.jsx` - Updated permission modal and flow
- `Frontend/src/pages/TakeCodingTest.jsx` - Same updates for coding tests

### Backend
- `Backend/routes/auth.js` - Added `/auth/verify-face` endpoint

### New Files
- `FaceRecognitionService/app.py` - Python microservice for face recognition
- `FaceRecognitionService/requirements.txt` - Python dependencies
- `FaceRecognitionService/README.md` - Service documentation
- `Docs/FACE_RECOGNITION_SETUP.md` - Setup guide

## User Experience Flow

1. User navigates to test
2. Permission modal appears
3. User clicks "Capture Image"
   - Camera modal opens
   - User positions face
   - Clicks "Capture & Verify"
   - Face is verified
   - Camera permission granted (if verified)
4. User clicks "Enable Microphone"
   - Microphone permission requested
   - Permission granted/denied
5. User clicks "Enable Location"
   - Location permission requested
   - Permission granted/denied
6. When all permissions are granted:
   - "Start Test" button appears
   - User can start the test

## Security Features

1. **Face Verification**: Ensures the person taking the test matches the registered user
2. **Individual Permissions**: Users can't bypass by denying one permission
3. **Server-Side Verification**: Face comparison happens on server, preventing client-side manipulation
4. **Threshold-Based Matching**: Configurable similarity threshold (default 60%)

## Configuration

### Environment Variables

Add to `.env`:
```env
FACE_RECOGNITION_SERVICE_URL=http://localhost:5000
```

### Face Matching Threshold

Edit `FaceRecognitionService/app.py`:
```python
threshold = 0.6  # Adjust between 0.5 (lenient) and 0.7 (strict)
```

## Setup Instructions

1. **Install Python Service**:
   ```bash
   cd FaceRecognitionService
   pip install -r requirements.txt
   python app.py
   ```

2. **Update Backend .env**:
   ```env
   FACE_RECOGNITION_SERVICE_URL=http://localhost:5000
   ```

3. **Restart Backend**:
   ```bash
   npm start
   ```

## Testing

1. Ensure user has a profile image saved
2. Navigate to a test
3. Click "Capture Image"
4. Verify face in camera modal
5. Enable microphone and location
6. Verify "Start Test" button appears
7. Start test

## Troubleshooting

### Face Verification Failing
- Check if Python service is running
- Verify user has profile image
- Check service logs
- Ensure good lighting and clear face visibility

### Permissions Not Granting
- Check browser console for errors
- Verify camera/microphone/location are available
- Check browser permissions settings

### Service Connection Errors
- Verify `FACE_RECOGNITION_SERVICE_URL` in `.env`
- Check if Python service is accessible
- Verify network connectivity

## Future Enhancements

Potential improvements:
- Real-time face detection feedback in camera modal
- Multiple face detection attempts
- Better error messages
- Retry mechanism for failed verifications
- Face quality checks (blur, lighting, etc.)

