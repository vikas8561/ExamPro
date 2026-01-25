# Face Descriptor Migration Guide

## Overview

This guide explains how to migrate existing users who have profile images stored in the database to the new secure face descriptor system.

## Problem

Users who uploaded profile images before the secure face descriptor system was implemented have:
- ✅ `profileImage` stored in database (raw image)
- ❌ `faceDescriptor` NOT stored (needed for face recognition)

## Solution

Use the **Migration Tool** to extract face descriptors from existing profile images and store them securely.

## Steps to Migrate

### 1. Access Migration Tool

1. Log in as **Admin**
2. Navigate to **Admin Panel** → **Migrate Face Data**
3. Or go directly to: `/admin/migrate-face-descriptors`

### 2. Run Migration

1. **Click "Fetch Users to Migrate"**
   - This finds all users with profile images but no face descriptors
   - Shows list of users that need processing

2. **Process Users**
   - **Option A**: Click "Process All" to process all users automatically
   - **Option B**: Click "Process" on individual users

3. **Wait for Completion**
   - Progress bar shows processing status
   - Each user's profile image is processed
   - Face descriptor is extracted and stored

### 3. Verify Migration

After migration:
- Users will have `faceDescriptor` stored
- `faceDescriptorSaved` flag will be `true`
- Face recognition will work for these users

## What Happens During Migration

1. **Fetch Profile Image**: Admin endpoint retrieves user's profile image
2. **Extract Descriptor**: face-api.js extracts 128-D face descriptor
3. **Store Descriptor**: Descriptor is stored in database (admin override)
4. **Update Flag**: `faceDescriptorSaved` is set to `true`

## Important Notes

### Security
- Migration tool is **Admin only**
- Uses admin override to bypass one-time upload restriction
- Original images remain in database (for display purposes)

### Performance
- Processing happens in browser (client-side)
- face-api.js models must be loaded first
- Each user takes ~2-5 seconds to process

### Errors
- **"No face detected"**: Image doesn't contain a clear face
- **"User has no profile image"**: User never uploaded an image
- **"Models not loaded"**: Wait for face-api.js models to load

## API Endpoints

### Get Users to Migrate
```
POST /api/migration/extract-face-descriptors
Admin only
```

### Get Full User Profile (Admin)
```
GET /api/users/:id/full-profile
Admin only
Returns full profile including profileImage
```

### Update Face Descriptor (Admin Override)
```
POST /api/users/:id/update-face-descriptor
Admin only
Body: { faceDescriptor: [128 numbers] }
```

## Manual Migration (Alternative)

If you prefer to migrate programmatically:

```javascript
// 1. Find users to migrate
const users = await User.find({
  profileImage: { $exists: true, $ne: null },
  $or: [
    { faceDescriptor: { $exists: false } },
    { faceDescriptor: null },
    { faceDescriptorSaved: { $ne: true } }
  ]
});

// 2. For each user, extract descriptor using face-api.js
// 3. Update user.faceDescriptor and user.faceDescriptorSaved
```

## After Migration

- ✅ All users with profile images will have face descriptors
- ✅ Face recognition will work during exams
- ✅ Original images remain for display (optional)
- ✅ System is now secure (no raw biometric data stored)

## Troubleshooting

### "No users found"
- All users already have face descriptors
- Or no users have profile images

### "Failed to extract descriptor"
- Check face-api.js models are in `/public/models`
- Verify image contains a clear face
- Check browser console for errors

### "Permission denied"
- Ensure you're logged in as Admin
- Check authentication token is valid

