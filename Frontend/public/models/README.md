# Face-API.js Models

This directory should contain the face-api.js model files required for face detection and recognition.

## Download Models

You need to download the following model files and place them in this directory:

1. **tiny_face_detector_model-weights_manifest.json**
2. **tiny_face_detector_model-shard1**
3. **face_landmark_68_model-weights_manifest.json**
4. **face_landmark_68_model-shard1**
5. **face_recognition_model-weights_manifest.json**
6. **face_recognition_model-shard1**

## Quick Setup

### Option 1: Download from CDN (Recommended)

Run this command in the `Frontend/public/models` directory:

```bash
# For Windows (PowerShell)
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/tiny_face_detector_model-weights_manifest.json" -OutFile "tiny_face_detector_model-weights_manifest.json"
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/tiny_face_detector_model-shard1" -OutFile "tiny_face_detector_model-shard1"
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/face_landmark_68_model-weights_manifest.json" -OutFile "face_landmark_68_model-weights_manifest.json"
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/face_landmark_68_model-shard1" -OutFile "face_landmark_68_model-shard1"
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/face_recognition_model-weights_manifest.json" -OutFile "face_recognition_model-weights_manifest.json"
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/face_recognition_model-shard1" -OutFile "face_recognition_model-shard1"
```

### Option 2: Manual Download

Visit: https://github.com/justadudewhohacks/face-api.js/tree/master/weights

Download the following files:
- `tiny_face_detector_model-weights_manifest.json`
- `tiny_face_detector_model-shard1`
- `face_landmark_68_model-weights_manifest.json`
- `face_landmark_68_model-shard1`
- `face_recognition_model-weights_manifest.json`
- `face_recognition_model-shard1`

Place all files in this directory (`Frontend/public/models/`).

## Verification

After downloading, your directory structure should look like:

```
Frontend/
  public/
    models/
      tiny_face_detector_model-weights_manifest.json
      tiny_face_detector_model-shard1
      face_landmark_68_model-weights_manifest.json
      face_landmark_68_model-shard1
      face_recognition_model-weights_manifest.json
      face_recognition_model-shard1
```

## Note

The face detection feature will not work until these models are downloaded and placed in this directory.

