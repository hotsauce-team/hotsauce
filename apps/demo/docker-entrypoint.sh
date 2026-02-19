#!/bin/sh
set -e

echo "📦 Installing dependencies..."
deno install

# Seed database if data directory is empty
if [ ! -d "data/base" ]; then
  echo "🌱 Seeding database..."
  deno task seed
fi

echo "🚀 Starting server in watch mode at http://localhost:3000"
echo "   Admin: http://localhost:3000/admin"
echo "   Login: admin@example.com / admin123"

deno task all:watch
