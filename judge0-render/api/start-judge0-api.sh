#!/bin/bash
set -e

# Create necessary directories
mkdir -p /box
chmod 755 /box

# Set up database
bundle exec rails db:create db:migrate

# Start the Judge0 API server
exec bundle exec puma -C config/puma.rb