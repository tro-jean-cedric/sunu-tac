# Build context: repository root (needs shared/ and vendor/)

# dev: Vite dev server with HMR (used by docker-compose.override.yml, sources bind-mounted)
FROM node:22-alpine AS dev
WORKDIR /srv/frontend
COPY vendor/ /srv/vendor/
COPY shared/ /srv/shared/
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
EXPOSE 5173
CMD ["npx", "vite", "--host", "0.0.0.0", "--port", "5173", "--strictPort"]

FROM dev AS build
# BUILD_MODE: "production" (test + console), "test-only" or "console-only"
ARG BUILD_MODE=production
RUN npx vite build --mode ${BUILD_MODE}

# default (last) stage: static build served by nginx
FROM nginx:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /srv/frontend/dist /usr/share/nginx/html
EXPOSE 80
