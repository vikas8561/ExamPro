# Official Judge0 API Server for Render Deployment
# Based on official Judge0 repository structure
FROM judge0/judge0:latest

# Copy configuration file to the correct location
COPY judge0.conf /judge0.conf

# Expose port 2358 (Judge0 standard port)
EXPOSE 2358

# Use official Judge0 server script
# This script handles database migration and Rails server startup
CMD ["/api/scripts/server"]