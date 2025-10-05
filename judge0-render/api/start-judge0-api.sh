#!/bin/bash
set -e

# Create /box directory if it doesn't exist
mkdir -p /box

# Set permissions for /box directory to allow non-root access
chown -R 1000:1000 /box || true
chmod -R 755 /box || true

# Start the Judge0 API server without sudo or root privileges
# Adjust this command as needed to start your API server
exec bundle exec puma -C config/puma.rb
