# Judge0 Worker Dockerfile for Render Deployment
FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    git \
    wget \
    unzip \
    ca-certificates \
    libpq-dev \
    libcap2-bin \
    libcap-dev \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

# Install isolate for code sandboxing
RUN git clone --depth 1 https://github.com/ioi/isolate.git /tmp/isolate && \
    cd /tmp/isolate && \
    make isolate && \
    cp isolate /usr/local/bin/ && \
    mkdir -p /usr/local/etc/isolate && \
    cp default.cf /usr/local/etc/isolate/ && \
    rm -rf /tmp/isolate

# Create necessary directories
RUN mkdir -p /box /app
WORKDIR /app

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create /box directory with proper permissions
RUN mkdir -p /box && chmod 755 /box

# Expose port for health checks
EXPOSE 2358

# Start the queue worker with health check server
CMD ["python", "queue_worker.py"]