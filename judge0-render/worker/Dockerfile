# Official Judge0 Worker Docker image with all language compilers already installed
FROM judge0/judge0:1.13.0

# The official Judge0 image already includes all compilers:
# - Python 3.8.1
# - Node.js 12.14.0 (JavaScript)
# - OpenJDK 13.0.1 (Java)
# - GCC 9.2.0 (C/C++)
# - Go 1.13.5
# - Ruby 2.7.0

# Set working directory
WORKDIR /app

# Copy worker files
COPY . .

# Install Python dependencies (pip3 is already available)
RUN pip3 install -r requirements.txt

# Start official worker
CMD ["python3", "queue_worker_official.py"]