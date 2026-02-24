#!/bin/sh
set -e
cd /app/server
npx prisma migrate deploy
node build/prisma/seed.js
exec node build/index.js
