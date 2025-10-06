#!/bin/bash

# Judge0 Worker Startup Script for Render
# Background worker - no port binding needed

echo "🔧 Starting Judge0 Worker (Background Service)..."

# Set environment variables
export RACK_ENV=${RACK_ENV:-production}
export RAILS_ENV=${RAILS_ENV:-production}

echo "🌍 Environment: $RAILS_ENV"
echo "🔗 Redis: $REDIS_URL"

# Start Judge0 worker (background service)
echo "🔧 Starting Judge0 background worker..."

# Use the official Judge0 workers script
exec /api/scripts/workers
