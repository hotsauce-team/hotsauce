#!/bin/bash
# Test npm packages in Docker containers with least-privilege security
#
# Usage: ./scripts/test-npm.sh [node-version]
#   node-version: 20 or 24 (default: 24)
#
# This script:
# 1. Builds a Docker image with Deno + Node (for dnt)
# 2. Builds npm packages inside the container
# 3. Runs Node.js e2e tests in a separate minimal container

set -euo pipefail

NODE_VERSION="${1:-24}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"

echo "═══════════════════════════════════════════════════════════"
echo "  Node.js ${NODE_VERSION} E2E Tests for @hotsauce/* packages"
echo "═══════════════════════════════════════════════════════════"

# Build the deno+node image if needed
IMAGE_NAME="hotsauce-build"
if ! docker image inspect "$IMAGE_NAME" &>/dev/null; then
  echo "▶ Building deno+node Docker image..."
  docker build -t "$IMAGE_NAME" -f "$SCRIPT_DIR/Dockerfile.build" "$PROJECT_DIR"
fi

# Step 1: Build npm packages with dnt
echo ""
echo "▶ Building npm packages with dnt..."
docker run --rm \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  -v "$PROJECT_DIR:/workspace" \
  -w /workspace \
  "$IMAGE_NAME" \
  deno run --no-lock \
    --ignore-env \
    --allow-env="DENO_DIR,HOME" \
    --allow-read="/workspace,/root/.npmrc" \
    --allow-write="/workspace" \
    scripts/npm/build_npm.ts

# Step 2: Run tests in Node.js
echo ""
echo "▶ Running tests in Docker (node:${NODE_VERSION}-slim)..."

# Create temp dir for npm install (writable)
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

# Copy test files to temp dir
cp "$PROJECT_DIR/npm-tests/package.json" "$TEMP_DIR/"
cp "$PROJECT_DIR/npm-tests/"*.test.js "$TEMP_DIR/"
cp "$PROJECT_DIR/npm-tests/schema.js" "$TEMP_DIR/"

# Copy built packages into workspace packages/ directory
mkdir -p "$TEMP_DIR/packages"
cp -r "$PROJECT_DIR/npm/core" "$TEMP_DIR/packages/"
cp -r "$PROJECT_DIR/npm/ui" "$TEMP_DIR/packages/"
cp -r "$PROJECT_DIR/npm/auth" "$TEMP_DIR/packages/"
cp -r "$PROJECT_DIR/npm/cms" "$TEMP_DIR/packages/"
cp -r "$PROJECT_DIR/npm/plugins-fs-storage" "$TEMP_DIR/packages/"
cp -r "$PROJECT_DIR/npm/plugins-s3-storage" "$TEMP_DIR/packages/"

# Step 2a: Install dependencies (needs network)
echo "Installing dependencies..."
docker run --rm \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  -v "$TEMP_DIR:/workspace:rw" \
  -w /workspace \
  "node:${NODE_VERSION}-slim" \
  npm install

# Step 2b: Run tests (no network needed)
echo ""
echo "Running tests..."
docker run --rm \
  --user node \
  --read-only \
  --network none \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --tmpfs /tmp:rw,noexec,nosuid,size=512m \
  -v "$TEMP_DIR:/workspace:ro" \
  -w /workspace \
  "node:${NODE_VERSION}-slim" \
  npm test

echo ""
echo "✅ All tests passed on Node.js ${NODE_VERSION}!"
