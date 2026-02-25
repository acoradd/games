#!/bin/sh
set -e
cd /app/server
npx prisma migrate deploy
node build/scripts/seed.js
exec node build/index.js
