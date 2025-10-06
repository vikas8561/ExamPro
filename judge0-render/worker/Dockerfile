# Official Judge0 Worker for Render Deployment
# Based on official Judge0 repository structure
FROM judge0/judge0:latest

# Set environment variables to force Redis connection to Render
ENV REDIS_URL=redis://red-d3h1lch5pdvs73essm20:6379
ENV REDIS_HOST=red-d3h1lch5pdvs73essm20
ENV REDIS_PORT=6379
ENV RESQUE_REDIS=redis://red-d3h1lch5pdvs73essm20:6379
ENV RESQUE_REDIS_SCHEDULER=redis://red-d3h1lch5pdvs73essm20:6379

# Use official Judge0 workers script with port binding
# Environment variables will be injected by Render
ENV PORT=2358
EXPOSE 2358
CMD ["/api/scripts/workers"]