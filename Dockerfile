# Multi-stage build for Article Manager

# Stage 1: Build frontend
FROM oven/bun:1 AS frontend-builder

WORKDIR /app

# Copy package files
COPY package.json bun.lock ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY src ./src
COPY scripts ./scripts
COPY tsconfig.json ./

# Build frontend
RUN bun run build

# Stage 2: Production runtime
FROM oven/bun:1-slim

WORKDIR /app

# Copy package files
COPY package.json bun.lock ./

# Install production dependencies only
RUN bun install --frozen-lockfile --production

# Copy backend source
COPY src/backend ./src/backend
COPY tsconfig.json ./

# Copy built frontend from builder stage
COPY --from=frontend-builder /app/public ./public

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 --ingroup nodejs bunuser

# Create data directory with proper permissions
RUN mkdir -p /data && \
    chown -R bunuser:nodejs /app /data

# Switch to non-root user
USER bunuser

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD bun -e "fetch('http://localhost:5000/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Set environment
ENV NODE_ENV=production
ENV PORT=5000
ENV DATA_DIR=/data

# Run the application
CMD ["bun", "src/backend/server.ts"]
