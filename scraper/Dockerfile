# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy monorepo root files
COPY package.json package-lock.json* ./
COPY packages ./packages

# Copy scraper package
COPY scraper/package.json scraper/tsconfig.json scraper/

# Install dependencies
RUN npm ci --prefer-offline --no-audit 2>/dev/null || npm install

# Copy scraper source
COPY scraper/src scraper/src

# Build
RUN cd scraper && npm run build

# Runtime stage
FROM node:22-alpine

WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Copy package files
COPY package.json package-lock.json* ./
COPY packages ./packages
COPY scraper/package.json scraper/

# Install production dependencies only
RUN npm ci --prefer-offline --no-audit --omit=dev 2>/dev/null || npm install --omit=dev

# Copy built code from builder
COPY --from=builder /app/scraper/dist scraper/dist

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "console.log('ok')" || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the scraper
CMD ["node", "scraper/dist/index.js"]
