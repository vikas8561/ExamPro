# ExamPro API.
#
# Built for linux/amd64 regardless of the machine doing the building: the
# deployment target is an x86_64 EC2 instance, and an image built natively on an
# Apple Silicon Mac would be arm64 and simply refuse to start there.
#
#   docker buildx build --platform linux/amd64 -t <repo>:<tag> --push .
#
# NODE_ENV is deliberately NOT set here. server.js branches on it for CORS —
# anything other than "production" allows every origin — so baking it in would
# silently change how the deployed API treats cross-origin requests. It belongs
# with the other runtime configuration, next to the database URIs.

# ── Dependencies ──────────────────────────────────────────────────────────
# Separate stage so the C++ toolchain bcrypt needs never reaches the final image.
FROM node:24-slim AS deps

WORKDIR /app
COPY package.json package-lock.json ./

# bcrypt ships prebuilt binaries for most platforms and compiles from source when
# it cannot find one. The build tools are here so that fallback works rather than
# failing the build on a platform without a prebuild.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && npm ci --omit=dev \
 && rm -rf /var/lib/apt/lists/*

# ── Runtime ───────────────────────────────────────────────────────────────
FROM node:24-slim

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Matches the PORT the application defaults to in server.js.
EXPOSE 4000

# The same command as `npm start`, without npm in the process tree so signals
# reach node directly and the container stops promptly.
CMD ["node", "--max-old-space-size=1024", "server.js"]
