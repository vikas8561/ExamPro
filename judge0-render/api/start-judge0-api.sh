#!/bin/bash
set -e

# Create necessary directories
mkdir -p /box
chmod 755 /box

# Run database migrations (skip create on managed Postgres)
bundle exec rails db:migrate

# Start the Judge0 API server
exec bundle exec puma -C config/puma.rb