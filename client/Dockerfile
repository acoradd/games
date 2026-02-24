FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json ./
COPY client/package*.json ./client/
WORKDIR /app/client
RUN npm ci
COPY client/ .
RUN npm run build

FROM nginx:stable-alpine AS runner
COPY --from=builder /app/client/dist /usr/share/nginx/html
COPY client/nginx.conf /etc/nginx/conf.d/default.conf
COPY client/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
EXPOSE 80
ENTRYPOINT ["/docker-entrypoint.sh"]
