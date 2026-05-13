# syntax=docker/dockerfile:1

# ─── Base: full source + deps ────────────────────────────────────────────────
FROM oven/bun:latest AS base
WORKDIR /app

# Copy the entire monorepo so workspace packages are linkable
COPY . .

# Install all dependencies (workspace packages need their source to symlink)
RUN bun install --frozen-lockfile

# ─── Builder: compile everything ─────────────────────────────────────────────
FROM base AS builder
ARG VITE_SERVER_URL=http://localhost:3000
ENV VITE_SERVER_URL=$VITE_SERVER_URL

# Only the web app needs a build step — server runs from TypeScript source via Bun
RUN bun run build --filter=web

# ─── Server: run TS source directly with Bun (avoids tsdown native-addon issues) ─
FROM oven/bun:latest AS server
WORKDIR /app

# Copy deps + full monorepo source so Bun can resolve workspace packages natively
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/server ./apps/server

EXPOSE 3000
# Bun runs TypeScript natively — no compilation step needed
CMD ["bun", "run", "--cwd", "/app/apps/server", "src/index.ts"]

# ─── Web: Nginx serving the built Vite SPA ────────────────────────────────────
FROM nginx:alpine AS web
ENV NGINX_ENTRYPOINT_QUIET_LOGS=1

COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

# Nginx config with SPA fallback
RUN printf 'server {\n\
    listen 80;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
    access_log off;\n\
    error_log /var/log/nginx/error.log warn;\n\
    location / {\n\
        try_files $uri $uri/ /index.html;\n\
    }\n\
    gzip on;\n\
    gzip_types text/plain text/css application/json application/javascript;\n\
}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
