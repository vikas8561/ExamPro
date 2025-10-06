# Official Judge0 API Server for Render Deployment
# Based on official Judge0 repository structure
FROM judge0/judge0:latest

# Set environment variables to force Redis connection to Render
ENV REDIS_URL=redis://red-d3h1lch5pdvs73essm20:6379
ENV REDIS_HOST=red-d3h1lch5pdvs73essm20
ENV REDIS_PORT=6379
ENV RESQUE_REDIS=redis://red-d3h1lch5pdvs73essm20:6379
ENV RESQUE_REDIS_SCHEDULER=redis://red-d3h1lch5pdvs73essm20:6379

# Expose port 2358 (Judge0 standard port)
EXPOSE 2358

# Use official Judge0 server script
# Configuration will be provided via environment variables
CMD ["/api/scripts/server"]