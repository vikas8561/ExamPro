# Face Recognition Security Implementation

## Overview

This document explains the secure, production-grade implementation of face recognition using face-api.js that follows industry best practices.

## Security Principles

### ❌ What We DON'T Store
- **Raw face images** in the database
- **Base64 encoded images** for face recognition
- **Any reversible biometric data**

### ✅ What We DO Store
- **Face Descriptor (128-D vector)** - Non-reversible biometric template
- **Profile Image (optional)** - Only for display purposes, NOT used for face recognition

## Architecture

### Registration Flow (One-Time)

```
User captures profile image
        ↓
face-api.js extracts face descriptor (128-D vector)
        ↓
Frontend sends to backend:
  - faceDescriptor: [128 numbers] (REQUIRED)
  - image: base64 (OPTIONAL, for display only)
        ↓
Backend stores:
  - faceDescriptor in database
  - image (optional) for display
        ↓
Image is NEVER used for face recognition
```

### Exam Proctoring Flow

```
Proctoring component loads
        ↓
Fetches faceDescriptor from secure endpoint
        ↓
During exam, live video feed is captured
        ↓
face-api.js extracts descriptor from live video
        ↓
Compare live descriptor vs stored descriptor
        ↓
If distance > 0.6 → Violation
```

## Database Schema

```javascript
{
  profileImage: String,        // Optional: for display only
  profileImageSaved: Boolean,   // Flag for image upload
  faceDescriptor: [Number],    // 128-D vector (REQUIRED for face recognition)
  faceDescriptorSaved: Boolean // Flag for descriptor upload
}
```

## API Endpoints

### 1. Upload Profile Image & Face Descriptor
```
POST /auth/profile/image

Request Body:
{
  "image": "data:image/png;base64,..." (optional),
  "faceDescriptor": [128 numbers] (required)
}

Response:
{
  "message": "Face descriptor saved successfully",
  "faceDescriptorSaved": true,
  "profileImage": "..." (if provided),
  "profileImageSaved": true (if image provided)
}
```

### 2. Get Face Descriptor (Secure Endpoint)
```
GET /auth/profile/face-descriptor

Response:
{
  "faceDescriptor": [128 numbers],
  "faceDescriptorSaved": true
}
```

**Security Note**: The regular `/auth/profile` endpoint does NOT return `faceDescriptor` to prevent exposure.

## Security Benefits

| Feature | Benefit |
|---------|---------|
| **Non-reversible** | Cannot reconstruct face from descriptor |
| **Small size** | ~512 bytes vs ~50KB+ for images |
| **Legally compliant** | Meets biometric template standards |
| **Industry standard** | Same approach as FaceID, Aadhaar |
| **Privacy-first** | No raw biometric data stored |

## Implementation Details

### Frontend: Profile Image Upload

1. User captures image
2. face-api.js extracts descriptor:
   ```javascript
   const detection = await faceapi
     .detectSingleFace(img)
     .withFaceLandmarks()
     .withFaceDescriptor();
   
   const faceDescriptor = Array.from(detection.descriptor);
   ```
3. Send to backend (descriptor required, image optional)

### Frontend: Proctoring Component

1. Fetch descriptor from secure endpoint:
   ```javascript
   const response = await apiRequest('/auth/profile/face-descriptor');
   const descriptor = new Float32Array(response.faceDescriptor);
   ```
2. Compare during exam:
   ```javascript
   const distance = faceapi.euclideanDistance(
     storedDescriptor,
     liveDescriptor
   );
   ```

## Migration Notes

For existing users with profile images:
- They need to re-upload their profile image
- The system will extract and store the face descriptor
- Old images remain for display but are not used for face recognition

## Best Practices

1. **Never log face descriptors** in production
2. **Encrypt at rest** (database encryption)
3. **Secure transmission** (HTTPS only)
4. **One-time upload** (descriptor cannot be changed)
5. **Separate endpoints** (descriptor not in regular profile endpoint)

## Compliance

This implementation follows:
- **GDPR**: Biometric template storage (not raw data)
- **Industry standards**: Same as major biometric systems
- **Security best practices**: Non-reversible templates only

## Troubleshooting

### "No face descriptor found"
- User needs to upload profile image
- System will extract descriptor automatically

### "Face descriptor extraction failed"
- Ensure face-api.js models are downloaded
- Check that image contains a clear face
- Verify camera permissions

### "Face matching not working"
- Verify descriptor is 128-dimensional array
- Check that models are loaded
- Ensure good lighting and clear face visibility

