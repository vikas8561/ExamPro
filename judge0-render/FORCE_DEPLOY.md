# Force Deploy Judge0 with Updated Configuration

## Issue Identified
Render is showing "Out of memory (used over 512Mi)" even though we upgraded to Standard plan. This indicates Render is using cached deployment settings.

## Solution: Force Redeploy

### Step 1: Delete Current Services
1. Go to Render Dashboard
2. Delete both services:
   - `judge0-api`
   - `judge0-worker`

### Step 2: Redeploy from GitHub
1. Click "New +" → "Web Service"
2. Connect GitHub repository
3. Use these settings:

#### API Service:
- **Name**: `judge0-api`
- **Root Directory**: `judge0-render/api`
- **Environment**: Docker
- **Plan**: Standard (NOT Starter)
- **Region**: Oregon
- **Branch**: main

#### Worker Service:
- **Name**: `judge0-worker`
- **Root Directory**: `judge0-render/worker`
- **Environment**: Docker
- **Plan**: Standard (NOT Starter)
- **Region**: Oregon
- **Branch**: main

### Step 3: Verify Configuration
After deployment, check:
- Memory limit should be 1GB+ (not 512MB)
- Both services should show "Standard" plan
- No "Out of memory" errors

## Alternative: Manual Environment Variables
If auto-deployment doesn't work, manually set these in Render dashboard:

### Critical Environment Variables:
```
RAILS_ENV=production
RACK_ENV=production
PORT=2358
```

### Judge0 Configuration:
```
CPU_TIME_LIMIT=5
MAX_CPU_TIME_LIMIT=15
MEMORY_LIMIT=128000
MAX_MEMORY_LIMIT=512000
INTERVAL=0.1
COUNT=3
MAX_QUEUE_SIZE=100
```

### Redis Configuration:
```
RESQUE_REDIS=redis://red-d3h1lch5pdvs73essm20:6379
RESQUE_REDIS_SCHEDULER=redis://red-d3h1lch5pdvs73essm20:6379
```

## Expected Results
- ✅ No "512Mi" memory errors
- ✅ Standard plan (1GB+ RAM)
- ✅ 200-300 student capacity
- ✅ Fast processing (0.1s polling)
