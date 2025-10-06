# Official Judge0 Docker image with all language compilers
FROM judge0/judge0:1.13.0

# Install additional language compilers
RUN apt-get update && apt-get install -y \
    nodejs \
    npm \
    openjdk-11-jdk \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Set JAVA_HOME
ENV JAVA_HOME=/usr/lib/jvm/java-11-openjdk-amd64

# Expose port
EXPOSE 2358

# Start Judge0 API
CMD ["bundle", "exec", "puma", "-C", "config/puma.rb"]