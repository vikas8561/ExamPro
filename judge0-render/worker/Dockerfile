# -------------------------
# Base image
# -------------------------
FROM python:3.11

# -------------------------
# Set working directory
# -------------------------
WORKDIR /app

# -------------------------
# Install system dependencies (for compiling psycopg2, isolate, etc.)
# -------------------------
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        gcc g++ make curl unzip git wget ca-certificates libcap-dev libcap2-bin && \
    rm -rf /var/lib/apt/lists/*

# -------------------------
# Install isolate for sandboxing code execution
# -------------------------
RUN git clone --depth 1 https://github.com/ioi/isolate.git /tmp/isolate && \
    cd /tmp/isolate && \
    make isolate && \
    cp isolate /usr/local/bin/ && \
    # Remove setcap to avoid root privileges requirement on Render
    # setcap cap_sys_admin,cap_dac_override,cap_setuid,cap_setgid+ep /usr/local/bin/isolate && \
    rm -rf /tmp/isolate

# -------------------------
# Create /box directory for isolate sandbox
# -------------------------
RUN mkdir -p /box

# -------------------------
# Copy requirements first for caching
# -------------------------
COPY requirements.txt ./ 

# -------------------------
# Install Python dependencies
# -------------------------
RUN pip install --no-cache-dir -r requirements.txt

# -------------------------
# Copy app code
# -------------------------
COPY worker.py ./

# -------------------------
# Run as root for isolate (requires root privileges)
# -------------------------
# Removed root requirement to support non-root execution on Render

# -------------------------
# Expose the port
# -------------------------
EXPOSE 2358

# -------------------------
# Start the worker with Gunicorn
# -------------------------
CMD ["gunicorn", "--bind", "0.0.0.0:2358", "--workers", "4", "worker:app", "redis"]
