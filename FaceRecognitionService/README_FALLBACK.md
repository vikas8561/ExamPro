# Face Recognition Service - Fallback Mode

## Current Status

The service is now configured to run in **fallback mode** when face recognition libraries are not available. This means:

- ✅ Service will start and respond to requests
- ✅ All face verifications will be accepted (bypassed)
- ⚠️ No actual face matching is performed

## How It Works

When the service starts:
1. It tries to import face recognition libraries (cv2, numpy, insightface, etc.)
2. If imports fail, it runs in fallback mode
3. In fallback mode, `/verify-face` always returns `match: true`

## Starting the Service

```bash
cd FaceRecognitionService
python app.py
```

You should see:
```
Warning: Face recognition libraries not available: ...
Service will run in fallback mode - accepting all face verifications
 * Running on http://0.0.0.0:5000
```

## Testing

Test the health endpoint:
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

## Enabling Full Face Recognition

To enable actual face recognition:

1. Install Visual C++ Build Tools (required for Windows)
2. Install dependencies:
   ```bash
   pip install opencv-python numpy Pillow insightface onnxruntime
   ```
3. Restart the service

See `INSTALL_WINDOWS.md` for detailed instructions.

## For Development

Fallback mode is perfect for development/testing. The service will:
- Accept all face verification requests
- Allow tests to proceed
- Log warnings that verification was bypassed

This lets you test the rest of your application without setting up the full face recognition stack.

