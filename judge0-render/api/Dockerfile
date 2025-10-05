# Use the official prebuilt Judge0 image
# Use an alternative base image that does not include lua or require chown
FROM ubuntu:22.04

# Install necessary dependencies for Judge0 runtime environment
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    git \
    libcap2-bin \
    gcc \
    g++ \
    make \
    wget \
    unzip \
    ca-certificates \
    sudo \
    && rm -rf /var/lib/apt/lists/*

# Create /box directory for isolate sandbox
RUN mkdir -p /box

# Expose the API port
EXPOSE 2358

# Copy the rest of the Judge0 API files (adjust as needed)
COPY . /app

# Set working directory
WORKDIR /app

# Install any additional dependencies or build steps here if needed

# Default command to run the Judge0 API (adjust as needed)
CMD ["./start-judge0-api.sh"]

# Fix permissions for /box directory to avoid root issues
RUN chown -R 1000:1000 /box || true
