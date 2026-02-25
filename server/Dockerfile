FROM node:24-slim AS builder
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json ./
COPY server/package*.json ./server/
WORKDIR /app/server
RUN npm ci
COPY server/prisma ./prisma
RUN npx prisma generate
COPY server/tsconfig*.json ./
COPY server/src ./src
RUN npm run build

FROM node:24-slim AS runner
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
COPY server/package*.json ./server/
WORKDIR /app/server
RUN npm ci --omit=dev
COPY --from=builder /app/server/build ./build
COPY --from=builder /app/server/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/server/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/server/node_modules/@prisma ./node_modules/@prisma
COPY server/prisma ./prisma
COPY server/src/scripts/OpenLexicon.tsv ./build/scripts/OpenLexicon.tsv
COPY server/docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh
EXPOSE 2567
ENTRYPOINT ["./docker-entrypoint.sh"]
