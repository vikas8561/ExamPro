# Judge0 API Dockerfile for Render Deployment
FROM ruby:3.1-slim

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
    rm -rf /tmp/isolate

# Create necessary directories
RUN mkdir -p /box /app
WORKDIR /app

# Copy Gemfile and install dependencies
COPY Gemfile* ./
RUN bundle config set --local without 'development test' && bundle install

# Copy application code
COPY . .

# Create /box directory with proper permissions
RUN mkdir -p /box && chmod 755 /box

# Expose port
EXPOSE 2358

# Set environment variables
ENV RAILS_ENV=production
ENV RACK_ENV=production

# Start the application
CMD ["bundle", "exec", "puma", "-C", "config/puma.rb"]