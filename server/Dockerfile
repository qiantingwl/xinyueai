FROM node:22-bookworm-slim
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY prisma ./prisma
RUN npm run prisma:generate
COPY nest-cli.json tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
RUN npm run build
EXPOSE 3100
CMD ["node", "dist/main.js"]
