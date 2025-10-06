# Official Judge0 Docker image with all language compilers already installed
FROM judge0/judge0:1.13.0

# The official Judge0 image already includes:
# - Python 3.8.1
# - Node.js 12.14.0 (JavaScript)
# - OpenJDK 13.0.1 (Java)
# - GCC 9.2.0 (C/C++)
# - Go 1.13.5
# - Ruby 2.7.0
# - And many more languages

# Expose port
EXPOSE 2358

# Start Judge0 API
CMD ["bundle", "exec", "puma", "-C", "config/puma.rb"]