# Face Recognition Setup Guide

This document explains how to set up and use the face recognition feature for test authentication.

## Overview

The face recognition system uses InsightFace (ArcFace) model to verify that the person taking the test matches the profile image stored in the database. This prevents unauthorized users from taking tests.

## Architecture

1. **Frontend**: Captures image from camera when user clicks "Capture Image"
2. **Backend API**: Receives captured image and calls Python service
3. **Python Microservice**: Uses InsightFace to compare faces and return similarity score

## Setup Instructions

### 1. Python Microservice Setup

Navigate to the `FaceRecognitionService` directory:

```bash
cd FaceRecognitionService
```

Install Python dependencies:

```bash
pip install -r requirements.txt
```

**Note**: The InsightFace model (`buffalo_l`) will be automatically downloaded on first run. This may take a few minutes.

### 2. Start the Python Service

```bash
python app.py
```

The service will run on port 5000 by default. You can change this by setting the `PORT` environment variable:

```bash
PORT=5001 python app.py
```

### 3. Backend Configuration

Add the face recognition service URL to your `.env` file:

```env
FACE_RECOGNITION_SERVICE_URL=http://localhost:5000
```

If the service is running on a different machine or port, update this URL accordingly.

### 4. Test the Service

You can test the service health endpoint:

```bash
curl http://localhost:5000/health
```

Expected response:
```json
{
  "status": "healthy",
  "service": "face-recognition",
  "model": "buffalo_l"
}
```

## How It Works

### User Flow

1. User clicks "Capture Image" button
2. Camera permission is requested
3. Camera modal opens showing live video feed
4. User clicks "Capture & Verify"
5. Image is captured and sent to backend
6. Backend calls Python service with:
   - User's profile image (from database)
   - Captured image (from camera)
7. Python service extracts face embeddings and calculates similarity
8. If similarity >= 0.6 (60%), face is verified
9. Test can proceed only after all permissions are granted

### Face Matching Threshold

The default threshold is **0.6** (60% similarity). This can be adjusted in `FaceRecognitionService/app.py`:

```python
threshold = 0.6  # Adjust based on security requirements
```

- **Lower threshold (0.5)**: More lenient, fewer false rejections, but less secure
- **Higher threshold (0.7)**: More strict, more secure, but may reject legitimate users

## Troubleshooting

### Service Not Starting

1. Check Python version (requires Python 3.8+)
2. Ensure all dependencies are installed
3. Check if port 5000 is already in use

### Face Not Detected

- Ensure good lighting
- Face should be clearly visible
- Remove masks or obstructions
- Ensure camera has proper focus

### Verification Failing

- Check if user has a profile image saved
- Verify image quality (should be clear and well-lit)
- Check service logs for errors
- Try adjusting the threshold if legitimate users are being rejected

### Service Connection Errors

- Verify `FACE_RECOGNITION_SERVICE_URL` in `.env`
- Check if Python service is running
- Verify network connectivity
- Check firewall settings

## Alternative: Client-Side Face Recognition

If you prefer not to use a Python microservice, you can use `face-api.js` for client-side face recognition. However, this is less secure as the comparison happens in the browser.

**Note**: The current implementation uses the Python microservice approach for better security and accuracy.

## Security Considerations

1. **Face embeddings are not stored**: Only the profile image is stored
2. **Verification happens server-side**: Prevents client-side manipulation
3. **Threshold can be adjusted**: Balance between security and user experience
4. **Fallback behavior**: If service is unavailable, test cannot start (configurable)

## Performance

- **Model loading**: ~2-3 seconds on first request
- **Face extraction**: ~100-200ms per image
- **Similarity calculation**: <10ms
- **Total verification time**: ~300-500ms (excluding network)

## Production Deployment

For production:

1. Deploy Python service on a separate server/container
2. Use HTTPS for all communications
3. Set up proper error handling and logging
4. Consider using GPU acceleration for faster processing
5. Implement rate limiting to prevent abuse
6. Monitor service health and performance

## Environment Variables

### Backend (.env)
```
FACE_RECOGNITION_SERVICE_URL=http://localhost:5000
```

### Python Service
```
PORT=5000  # Optional, defaults to 5000
```

## API Reference

### POST /verify-face

**Request:**
```json
{
  "profileImage": "data:image/png;base64,...",
  "capturedImage": "data:image/png;base64,..."
}
```

**Response:**
```json
{
  "match": true,
  "confidence": 0.85,
  "threshold": 0.6,
  "message": "Face verification completed"
}
```

**Error Response:**
```json
{
  "error": "No face detected in captured image",
  "match": false
}
```

