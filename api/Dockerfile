# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy monorepo root files
COPY package.json package-lock.json* ./
COPY packages ./packages

# Copy api package
COPY api/package.json api/tsconfig.json api/

# Install dependencies (npm workspace aware)
RUN npm ci --prefer-offline --no-audit 2>/dev/null || npm install

# Copy api source
COPY api/src api/src
COPY api/prisma api/prisma

# Generate Prisma types
RUN cd api && npm run db:generate

# Build shared package
RUN cd packages/shared && npm run build

# Build API
RUN cd api && npm run build

# Runtime stage
FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache dumb-init

COPY package.json package-lock.json* ./
COPY packages ./packages
COPY api/package.json api/

RUN npm ci --prefer-offline --no-audit --omit=dev 2>/dev/null || npm install --omit=dev

COPY --from=builder /app/packages/shared/dist packages/shared/dist
COPY --from=builder /app/api/dist api/dist

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 3001), (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})" || exit 1

ENTRYPOINT ["dumb-init", "--"]

CMD ["node", "api/dist/server.js"]
