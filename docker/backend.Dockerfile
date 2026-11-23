# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY backend/server/package.json backend/server/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY backend/server/tsconfig.json ./
COPY backend/server/src ./src
RUN npm run build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=8080 \
    TCP_PORT=9339 \
    EKOLOKO_HOST=localhost
WORKDIR /app
RUN groupadd --system ekoloko && useradd --system --gid ekoloko ekoloko
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY backend/server/package.json ./
# Bilingual admin console (static, zero-build)
COPY admin/web ./admin/web
RUN mkdir -p /app/database /app/config /app/static-data /app/client && \
    chown -R ekoloko:ekoloko /app
USER ekoloko
EXPOSE 8080 9339
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
