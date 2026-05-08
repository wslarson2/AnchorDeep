# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy monorepo root files
COPY package.json package-lock.json* ./
COPY packages ./packages

# Copy app package
COPY app/package.json app/tsconfig.json app/tsconfig.node.json app/vite.config.ts app/index.html app/

# Install dependencies
RUN npm ci --prefer-offline --no-audit 2>/dev/null || npm install

# Copy app source
COPY app/src app/src

# Build
RUN cd app && npm run build

# Runtime stage - serve with nginx
FROM nginx:alpine

COPY --from=builder /app/app/dist /usr/share/nginx/html

RUN rm /etc/nginx/conf.d/default.conf
COPY app/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 5173

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:5173/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
