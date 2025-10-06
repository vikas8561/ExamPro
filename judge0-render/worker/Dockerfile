# Official Judge0 Worker Docker image with all language compilers
FROM judge0/judge0:1.13.0

# Install all language compilers and worker dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    nodejs \
    npm \
    openjdk-11-jdk \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Set JAVA_HOME
ENV JAVA_HOME=/usr/lib/jvm/java-11-openjdk-amd64

# Set working directory
WORKDIR /app

# Copy worker files
COPY . .

# Install Python dependencies
RUN pip3 install -r requirements.txt

# Start worker
CMD ["python3", "queue_worker.py"]