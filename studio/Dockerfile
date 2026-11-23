# Build from repository root: docker build -f studio/Dockerfile .
# Build Flutter preview first; stale or missing artifacts fail packaging.
FROM node:24-bookworm-slim AS build
WORKDIR /app/studio
COPY studio/package*.json ./
RUN npm ci
COPY studio/index.html studio/vite.config.mjs ./
COPY studio/web ./web
COPY studio/shared ./shared
COPY studio/scripts ./scripts
COPY studio/public ./public
COPY lib /app/lib
COPY pubspec.yaml /app/pubspec.yaml
COPY packages/spacewidget_adapters/lib /app/packages/spacewidget_adapters/lib
COPY packages/spacewidget_adapters/pubspec.yaml /app/packages/spacewidget_adapters/pubspec.yaml
COPY studio/preview/lib ./preview/lib
COPY studio/preview/assets ./preview/assets
COPY studio/preview/pubspec* ./preview/
RUN node scripts/verify-preview.mjs && npm run build

FROM node:24-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4100 STUDIO_DATA_DIR=/app/data
WORKDIR /app/studio
COPY studio/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY studio/server ./server
COPY studio/shared ./shared
COPY studio/assets ./assets
COPY studio/components ./components
COPY studio/templates ./templates
COPY studio/scripts ./scripts
COPY studio/figma-plugin ./figma-plugin
COPY --from=build /app/studio/dist ./dist
COPY --from=build /app/studio/public ./public
RUN mkdir -p /app/data && chown -R node:node /app
USER node
VOLUME ["/app/data"]
EXPOSE 4100
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:4100/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","server/index.mjs"]
