# Official Judge0 Worker for Render Deployment
# Based on official Judge0 repository structure
FROM judge0/judge0:latest

# Copy configuration file to the correct location
COPY judge0.conf /judge0.conf

# Use official Judge0 workers script
# This script manages Resque workers and job processing
CMD ["/api/scripts/workers"]