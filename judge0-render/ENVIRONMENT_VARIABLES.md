# Environment Variables for Manual Deployment

## Issue Identified
When deploying services manually in Render (not using render.yaml), the `fromDatabase` references don't work automatically. We need to set environment variables manually.

## Required Environment Variables

### For API Service (Web Service):
```bash
# Rails Configuration
RAILS_ENV=production
RACK_ENV=production
PORT=2358
SECRET_KEY_BASE=<generate_new_secret>

# Database Configuration (Replace with your actual database values)
POSTGRES_HOST=<your_database_host>
POSTGRES_PORT=5432
POSTGRES_DB=<your_database_name>
POSTGRES_USER=<your_database_user>
POSTGRES_PASSWORD=<your_database_password>

# Redis Configuration (Your existing Redis)
REDIS_HOST=red-d3h1lch5pdvs73essm20
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_URL=redis://red-d3h1lch5pdvs73essm20:6379

# Judge0 Configuration
CPU_TIME_LIMIT=5
MAX_CPU_TIME_LIMIT=15
CPU_EXTRA_TIME=2
MAX_CPU_EXTRA_TIME=5
WALL_TIME_LIMIT=10
MAX_WALL_TIME_LIMIT=20
MEMORY_LIMIT=128000
MAX_MEMORY_LIMIT=512000
STACK_LIMIT=128000
MAX_STACK_LIMIT=256000
MAX_PROCESSES_AND_OR_THREADS=60
MAX_MAX_PROCESSES_AND_OR_THREADS=120
MAX_FILE_SIZE=1024
MAX_MAX_FILE_SIZE=4096
NUMBER_OF_RUNS=1
MAX_NUMBER_OF_RUNS=20
ENABLE_BATCHED_REQUESTS=false
ALLOW_ENABLE_BATCHED_REQUESTS=true
ENABLE_WAIT_RESULT=false
ALLOW_ENABLE_WAIT_RESULT=true
ENABLE_ATOMIC_FILE=false
ALLOW_ENABLE_ATOMIC_FILE=true
USE_DOCS_AS_HOMEPAGE=false
DISABLE_IMPLICIT_BASE64_ENCODING=false

# Judge0 Workers Configuration
INTERVAL=0.1
COUNT=3
MAX_QUEUE_SIZE=100

# Rails Configuration for Performance
RAILS_MAX_THREADS=8
RAILS_SERVER_PROCESSES=2
DATABASE_POOL=25

# Redis Configuration for Resque
RESQUE_REDIS=redis://red-d3h1lch5pdvs73essm20:6379
RESQUE_REDIS_SCHEDULER=redis://red-d3h1lch5pdvs73essm20:6379
REDIS_URL_RESQUE=redis://red-d3h1lch5pdvs73essm20:6379
REDIS_URL_RESQUE_SCHEDULER=redis://red-d3h1lch5pdvs73essm20:6379
REDIS_HOST=red-d3h1lch5pdvs73essm20
REDIS_PORT=6379
REDIS_DB=0
REDIS_PASSWORD=
REDIS_NAMESPACE=judge0
REDIS_SIDEKIQ_URL=redis://red-d3h1lch5pdvs73essm20:6379
```

### For Worker Service (Background Worker):
```bash
# Rails Configuration
RAILS_ENV=production
SECRET_KEY_BASE=<generate_new_secret>

# Database Configuration (Same as API - Replace with your actual database values)
POSTGRES_HOST=<your_database_host>
POSTGRES_PORT=5432
POSTGRES_DB=<your_database_name>
POSTGRES_USER=<your_database_user>
POSTGRES_PASSWORD=<your_database_password>

# Redis Configuration (Same as API)
REDIS_HOST=red-d3h1lch5pdvs73essm20
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_URL=redis://red-d3h1lch5pdvs73essm20:6379

# Judge0 Configuration (Same as API)
CPU_TIME_LIMIT=5
MAX_CPU_TIME_LIMIT=15
CPU_EXTRA_TIME=2
MAX_CPU_EXTRA_TIME=5
WALL_TIME_LIMIT=10
MAX_WALL_TIME_LIMIT=20
MEMORY_LIMIT=128000
MAX_MEMORY_LIMIT=512000
STACK_LIMIT=128000
MAX_STACK_LIMIT=256000
MAX_PROCESSES_AND_OR_THREADS=60
MAX_MAX_PROCESSES_AND_OR_THREADS=120
MAX_FILE_SIZE=1024
MAX_MAX_FILE_SIZE=4096
NUMBER_OF_RUNS=1
MAX_NUMBER_OF_RUNS=20
ENABLE_BATCHED_REQUESTS=false
ALLOW_ENABLE_BATCHED_REQUESTS=true
ENABLE_WAIT_RESULT=false
ALLOW_ENABLE_WAIT_RESULT=true
ENABLE_ATOMIC_FILE=false
ALLOW_ENABLE_ATOMIC_FILE=true
USE_DOCS_AS_HOMEPAGE=false
DISABLE_IMPLICIT_BASE64_ENCODING=false

# Judge0 Workers Configuration
INTERVAL=0.1
COUNT=3
MAX_QUEUE_SIZE=100

# Rails Configuration for Performance
RAILS_MAX_THREADS=5
RAILS_SERVER_PROCESSES=2
DATABASE_POOL=20

# Redis Configuration for Resque (Same as API)
RESQUE_REDIS=redis://red-d3h1lch5pdvs73essm20:6379
RESQUE_REDIS_SCHEDULER=redis://red-d3h1lch5pdvs73essm20:6379
REDIS_URL_RESQUE=redis://red-d3h1lch5pdvs73essm20:6379
REDIS_URL_RESQUE_SCHEDULER=redis://red-d3h1lch5pdvs73essm20:6379
REDIS_HOST=red-d3h1lch5pdvs73essm20
REDIS_PORT=6379
REDIS_DB=0
REDIS_PASSWORD=
REDIS_NAMESPACE=judge0
REDIS_SIDEKIQ_URL=redis://red-d3h1lch5pdvs73essm20:6379
```

## Steps to Fix:

### 1. Get Your Database Information
Go to your Render dashboard → Database service → Settings → Connection
Copy these values:
- Host
- Port (usually 5432)
- Database name
- Username
- Password

### 2. Set Environment Variables
For each service (API and Worker):

1. Go to Render Dashboard
2. Click on your service
3. Go to "Environment" tab
4. Add all the variables above
5. Replace `<your_database_*>` with your actual database values
6. Generate a new SECRET_KEY_BASE for each service

### 3. Redeploy Services
After setting environment variables:
1. Go to "Manual Deploy" 
2. Click "Deploy latest commit"

### 4. Test
Run the test again:
```bash
node SIMPLE_TEST.js
```

The `/languages` endpoint should now return 200 instead of 500.
