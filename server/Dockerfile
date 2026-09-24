FROM node:22-bookworm-slim@sha256:d649c27dae7ba0137b3cef5dd75baa422c08dc3d9e3fc0c23dfb172dc3cc6436
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
# Keep npm's cache and debug logs out of the runtime image. The cleanup is in
# the same layer as install so the files are not left in an earlier layer.
RUN npm ci \
  && npm cache clean --force >/dev/null 2>&1 \
  && rm -rf /root/.npm/_logs /root/.npm/_cacache
COPY prisma ./prisma
RUN npm run prisma:generate
COPY nest-cli.json tsconfig.json ./
COPY src ./src
# Bundled prompt snapshots are release assets (runtime cache remains optional).
COPY prompt-library-data ./prompt-library-data
COPY scripts ./scripts
RUN npm run build
# npm can recreate debug logs while Prisma or the build runs; clean them after
# all build steps so they cannot be carried into the runtime image. Production
# starts with node and the project-local Prisma CLI, so global npm/npx only add
# an unused package-management attack surface.
RUN mkdir -p /app/uploads /app/storage \
  && chown -R node:node /app/uploads /app/storage \
  && rm -rf /root/.npm/_logs /root/.npm/_cacache \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
USER node
EXPOSE 3100
CMD ["node", "scripts/start-production.cjs"]
