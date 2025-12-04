# Face Recognition Service

This is a Python microservice for face recognition using InsightFace (ArcFace) model.

## Setup

1. Install Python dependencies:
```bash
pip install -r requirements.txt
```

2. The InsightFace model will be automatically downloaded on first run.

## Running the Service

```bash
python app.py
```

The service will run on port 5000 by default (configurable via PORT environment variable).

## API Endpoints

### Health Check
```
GET /health
```

### Verify Face
```
POST /verify-face
Content-Type: application/json

{
  "profileImage": "data:image/png;base64,...",
  "capturedImage": "data:image/png;base64,..."
}
```

Response:
```json
{
  "match": true,
  "confidence": 0.85,
  "threshold": 0.6,
  "message": "Face verification completed"
}
```

## Environment Variables

- `PORT`: Port number (default: 5000)

## Notes

- The service uses the `buffalo_l` model from InsightFace, which provides good accuracy
- Face matching threshold is set to 0.6 (60% similarity)
- The service extracts 512-dimensional face embeddings and uses cosine similarity for comparison
- If no face is detected in either image, the verification will fail

