# Quick Start: Face Recognition Service

## The Error You're Seeing

If you see `503 Service Unavailable` when trying to verify your face, it means the Python face recognition service is not running.

## Quick Fix - Option 1: Start the Service

### Step 1: Open a new terminal/command prompt

### Step 2: Navigate to the FaceRecognitionService folder
```bash
cd FaceRecognitionService
```

### Step 3: Install dependencies (first time only)
```bash
pip install -r requirements.txt
```

**Note**: This may take a few minutes as it downloads the InsightFace model.

### Step 4: Start the service
```bash
python app.py
```

You should see:
```
Loading InsightFace model...
InsightFace model loaded successfully!
 * Running on http://0.0.0.0:5000
```

### Step 5: Keep this terminal open
The service must stay running while you use the application.

## Quick Fix - Option 2: Development Mode (Bypass Face Verification)

If you want to test without the Python service, you can enable development mode:

### Add to your Backend `.env` file:
```env
FACE_RECOGNITION_ENABLED=false
```

OR

```env
FACE_RECOGNITION_FALLBACK=true
```

- `FACE_RECOGNITION_ENABLED=false` - Completely disables face verification
- `FACE_RECOGNITION_FALLBACK=true` - Allows fallback if service is unavailable

### Restart your backend server after adding these settings.

## Verify the Service is Running

Test the service health endpoint:
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

## Troubleshooting

### Port 5000 Already in Use
If port 5000 is already in use, change the port:

1. Set environment variable:
   ```bash
   # Windows
   set PORT=5001
   python app.py
   
   # Linux/Mac
   PORT=5001 python app.py
   ```

2. Update Backend `.env`:
   ```env
   FACE_RECOGNITION_SERVICE_URL=http://localhost:5001
   ```

### Python Not Found
Make sure Python 3.8+ is installed:
```bash
python --version
```

### Dependencies Installation Fails
Try upgrading pip:
```bash
pip install --upgrade pip
pip install -r requirements.txt
```

### Model Download Takes Too Long
The InsightFace model is ~100MB and downloads automatically on first run. This is normal and only happens once.

## Production Setup

For production, you should:
1. Always run the Python service (don't use fallback)
2. Use a process manager like PM2 or supervisor
3. Set up proper logging
4. Monitor service health

## Need Help?

Check the detailed documentation:
- `Docs/FACE_RECOGNITION_SETUP.md` - Full setup guide
- `FaceRecognitionService/README.md` - Service documentation

