# Installing Face Recognition Service on Windows

## The Problem

Some Python packages (`insightface`, `stringzilla`) require C++ compilation, which needs Microsoft Visual C++ Build Tools on Windows.

## Solution Options

### Option 1: Install Visual C++ Build Tools (Recommended for Production)

1. Download and install **Microsoft C++ Build Tools**:
   - Visit: https://visualstudio.microsoft.com/visual-cpp-build-tools/
   - Download "Build Tools for Visual Studio"
   - During installation, select "C++ build tools" workload
   - This is a large download (~3-6 GB) and takes 10-30 minutes

2. After installation, restart your terminal and try again:
   ```bash
   pip install flask flask-cors opencv-python numpy Pillow insightface onnxruntime
   ```

### Option 2: Use Development Fallback Mode (Quick Fix)

For development/testing, you can bypass face recognition:

1. Add to your `Backend/.env` file:
   ```env
   FACE_RECOGNITION_FALLBACK=true
   ```

2. Restart your backend server

3. Face verification will be bypassed, allowing tests to proceed

### Option 3: Use Alternative Face Recognition Library

We can switch to `deepface` which has better Windows support:

```bash
pip install deepface
```

Then update `app.py` to use deepface instead of insightface.

### Option 4: Use Docker (Advanced)

Run the Python service in a Docker container which has all build tools pre-installed.

## Quick Start (Development Mode)

For now, to continue testing:

1. **Enable fallback mode** - Add to `Backend/.env`:
   ```env
   FACE_RECOGNITION_FALLBACK=true
   ```

2. **Restart backend server**

3. **Test will proceed without face verification**

## Production Setup

For production, you should:
1. Install Visual C++ Build Tools (Option 1)
2. Install all dependencies properly
3. Remove fallback mode
4. Run the Python service

## Need Help?

- Visual C++ Build Tools: https://visualstudio.microsoft.com/visual-cpp-build-tools/
- Python Windows FAQ: https://wiki.python.org/moin/WindowsCompilers

