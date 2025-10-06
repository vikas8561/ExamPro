# Redis Connection Fix for Judge0 on Render

## Issue
```
Redis::CannotConnectError: Error connecting to Redis on localhost:6379 (Errno::ECONNREFUSED)
```

## Root Cause
Judge0 is hardcoded to connect to `localhost:6379` instead of using the Render Redis instance.

## Solution Applied

### 1. Enhanced Environment Variables
Added comprehensive Redis configuration to force Judge0 to use Render Redis:

#### In `render.yaml` files:
```yaml
# Primary Redis URLs
- key: REDIS_URL
  value: "redis://red-d3h1lch5pdvs73essm20:6379"
- key: RESQUE_REDIS
  value: "redis://red-d3h1lch5pdvs73essm20:6379"
- key: RESQUE_REDIS_SCHEDULER
  value: "redis://red-d3h1lch5pdvs73essm20:6379"

# Additional Redis Configuration
- key: REDIS_HOST
  value: "red-d3h1lch5pdvs73essm20"
- key: REDIS_PORT
  value: "6379"
- key: REDIS_DB
  value: "0"
- key: REDIS_PASSWORD
  value: ""
- key: REDIS_NAMESPACE
  value: "judge0"
- key: REDIS_SIDEKIQ_URL
  value: "redis://red-d3h1lch5pdvs73essm20:6379"
```

#### In Dockerfiles:
```dockerfile
ENV REDIS_URL=redis://red-d3h1lch5pdvs73essm20:6379
ENV REDIS_HOST=red-d3h1lch5pdvs73essm20
ENV REDIS_PORT=6379
ENV RESQUE_REDIS=redis://red-d3h1lch5pdvs73essm20:6379
ENV RESQUE_REDIS_SCHEDULER=redis://red-d3h1lch5pdvs73essm20:6379
```

### 2. Multiple Redis Connection Methods
Configured all possible Redis environment variables that Judge0 might use:
- `REDIS_URL` - Primary connection string
- `RESQUE_REDIS` - Resque queue system
- `RESQUE_REDIS_SCHEDULER` - Resque scheduler
- `REDIS_HOST` - Host-only configuration
- `REDIS_PORT` - Port-only configuration
- `REDIS_SIDEKIQ_URL` - Sidekiq alternative

## Deployment Steps

### 1. Commit Changes
```bash
git add .
git commit -m "Fix Redis connection - force Judge0 to use Render Redis"
git push origin main
```

### 2. Redeploy Services
1. Go to Render Dashboard
2. Manual Deploy → "Deploy latest commit"
3. Or delete and recreate services to ensure clean deployment

### 3. Verify Redis Connection
After deployment, check logs for:
- ✅ No "localhost:6379" errors
- ✅ Successful Redis connection messages
- ✅ Worker and scheduler starting correctly

## Expected Results
- ✅ Redis connection successful
- ✅ Workers processing submissions
- ✅ No "ECONNREFUSED" errors
- ✅ Judge0 fully operational

## Troubleshooting

### If Redis still fails:
1. **Check Render Redis Status**: Ensure Redis service is running
2. **Verify Redis URL**: Confirm `red-d3h1lch5pdvs73essm20:6379` is correct
3. **Network Connectivity**: Ensure services can reach each other
4. **Redis Authentication**: Check if password is required

### Alternative Redis Configuration:
If the current Redis instance has issues, create a new one:
1. Render Dashboard → New + → Redis
2. Update all Redis URLs with new instance
3. Redeploy services

## Success Indicators
- No Redis connection errors in logs
- Workers showing "Starting workers" message
- API responding to requests
- Submissions being processed
