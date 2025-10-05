# TODO: Fix IsolateJob Errors in Judge0 Worker

## Completed
- [x] Analyze logs and identify issues: "Must be started as root" and missing /box/main.cpp
- [x] Update worker/Dockerfile to install isolate
- [x] Update worker/Dockerfile to run as root (remove USER appuser)
- [x] Update worker/Dockerfile to create /box directory
- [x] Update api/Dockerfile to create /box directory
- [x] Create api/.render.yaml to run the API container as root

## Pending
- [ ] Deploy the updated API and worker and test submissions
- [ ] Verify that isolate is installed and working in API
- [ ] Check logs for successful code execution without errors
- [x] Attempted local Docker build test but Docker not available in environment
