#!/bin/sh
# Container entrypoint for the www app: initialise + seed the SQLite
# database on first run, then serve on all interfaces (the deno.jsonc
# tasks bind 127.0.0.1 for host dev, which breaks the compose port map).
set -e

if [ ! -f data/www.db ]; then
  deno task init
  deno task seed
fi

exec deno serve --parallel --port=3010 --host=0.0.0.0 \
  --allow-read=./data,./static --allow-write=./data \
  --allow-net=0.0.0.0:3010 \
  --allow-env=NODE_ENV,DATABASE_URL,CMS_CSRF_SECRET,CMS_JWT_SECRET \
  server.ts
