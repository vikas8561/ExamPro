# Face Descriptor Migration - Setup Guide

## Quick Answer: No Commands Needed! ✅

The migration is **fully automated** through the Admin UI. No command-line scripts or database migrations required.

## Prerequisites Checklist

Before running the migration, ensure:

### 1. ✅ Database Schema (Already Done)
- The `faceDescriptor` field is already added to the User model
- MongoDB is schema-less, so existing users will work fine
- **No action needed**

### 2. ✅ Backend Routes (Already Done)
- Migration routes are registered in `server.js`
- Admin endpoints are set up
- **No action needed**

### 3. ✅ Frontend Component (Already Done)
- Migration tool is added to Admin Panel
- **No action needed**

### 4. ⚠️ Face-API.js Models (REQUIRED)
You **MUST** download face-api.js models before migration:

```powershell
# Windows PowerShell
cd Frontend/public/models
.\download-models.ps1
```

```bash
# Linux/Mac
cd Frontend/public/models
chmod +x download-models.sh
./download-models.sh
```

**Or manually download** from:
https://github.com/justadudewhohacks/face-api.js/tree/master/weights

Files needed:
- `tiny_face_detector_model-weights_manifest.json`
- `tiny_face_detector_model-shard1`
- `face_landmark_68_model-weights_manifest.json`
- `face_landmark_68_model-shard1`
- `face_recognition_model-weights_manifest.json`
- `face_recognition_model-shard1`

## How to Run Migration

### Step 1: Start Your Servers
```bash
# Backend
cd Backend
npm start

# Frontend (in another terminal)
cd Frontend
npm run dev
```

### Step 2: Access Migration Tool
1. Log in as **Admin**
2. Navigate to: **Admin Panel** → **Migrate Face Data**
3. Or go to: `http://localhost:5173/admin/migrate-face-descriptors`

### Step 3: Run Migration
1. Click **"Fetch Users to Migrate"**
2. Review the list of users
3. Click **"Process All"** or process individually
4. Wait for completion

## What Happens Automatically

- ✅ Finds users with profile images but no descriptors
- ✅ Extracts face descriptors from images
- ✅ Stores descriptors in database
- ✅ Updates `faceDescriptorSaved` flag
- ✅ Shows progress in real-time

## No Manual Steps Required

- ❌ No database migration scripts
- ❌ No npm/node commands
- ❌ No manual SQL/MongoDB queries
- ❌ No code changes needed

Everything is handled by the UI tool!

## Troubleshooting

### "Models not loaded"
- Ensure face-api.js models are in `/Frontend/public/models/`
- Check browser console for errors
- Wait for models to load (first time takes ~10-30 seconds)

### "No users found"
- All users already have face descriptors, OR
- No users have profile images uploaded

### "Permission denied"
- Ensure you're logged in as Admin
- Check authentication token is valid

## Verification

After migration, verify in database:
```javascript
// Users should have:
{
  faceDescriptor: [128 numbers],
  faceDescriptorSaved: true
}
```

Or check in Admin Panel → Users section.

