# Official Judge0 Worker for Render Deployment
# Based on official Judge0 repository structure
FROM judge0/judge0:latest

# Set environment variable to force Redis connection to Render
ENV REDIS_URL=redis://red-d3h1lch5pdvs73essm20:6379

# Use official Judge0 workers script
# Environment variables will be injected by Render
CMD ["/api/scripts/workers"]