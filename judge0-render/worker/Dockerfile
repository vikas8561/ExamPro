# Official Judge0 Worker for Render Deployment
# Based on official Judge0 repository structure
FROM judge0/judge0:latest

# Create startup script to fix Redis connection
RUN echo '#!/bin/bash' > /start-worker.sh && \
    echo 'export REDIS_HOST=${REDIS_HOST}' >> /start-worker.sh && \
    echo 'export REDIS_PORT=${REDIS_PORT}' >> /start-worker.sh && \
    echo 'export REDIS_PASSWORD=${REDIS_PASSWORD}' >> /start-worker.sh && \
    echo 'export REDIS_URL=${REDIS_URL}' >> /start-worker.sh && \
    echo 'echo "Connecting to Redis at ${REDIS_HOST}:${REDIS_PORT}"' >> /start-worker.sh && \
    echo 'exec /api/scripts/workers' >> /start-worker.sh && \
    chmod +x /start-worker.sh

# Use custom startup script
CMD ["/start-worker.sh"]