#!/bin/sh
set -e
cd /app/server
npx prisma migrate deploy
node build/scripts/seed.js
node build/scripts/importWords.js
exec node build/index.js
