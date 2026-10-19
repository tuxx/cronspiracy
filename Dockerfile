# syntax=docker/dockerfile:1
FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build && pnpm test

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data
# Everything is bundled into build/ (all deps are devDependencies), so no node_modules at runtime.
COPY --from=build /app/build ./build
COPY --from=build /app/package.json /app/server.js ./
COPY docker-entrypoint.sh /usr/local/bin/
RUN apk add --no-cache su-exec && mkdir -p /data && chown node:node /data
# Starts as root only to fix /data ownership, then runs as `node` (uid 1000). See docker-entrypoint.sh.
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "--disable-warning=ExperimentalWarning", "server.js"]
