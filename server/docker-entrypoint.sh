#!/bin/sh
set -e
cd /app/server
npx prisma migrate deploy
node build/seed.js
exec node build/index.js
