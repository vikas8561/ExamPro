#!/bin/bash

# Judge0 Server Startup Script for Render
# Forces Judge0 to bind to port 2358

echo "🚀 Starting Judge0 API Server..."

# Set port environment variable
export PORT=${PORT:-2358}
export RACK_ENV=${RACK_ENV:-production}
export RAILS_ENV=${RAILS_ENV:-production}

echo "📡 Port: $PORT"
echo "🌍 Environment: $RAILS_ENV"

# Start Judge0 server with explicit port binding
echo "🔧 Starting Judge0 server on port $PORT..."

# Use the official Judge0 server script but ensure it binds to our port
exec /api/scripts/server
