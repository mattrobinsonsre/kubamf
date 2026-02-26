# Multi-stage build for web deployment
FROM public.ecr.aws/docker/library/node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Create the build directory for icon generation
RUN mkdir -p build

# Build the application
RUN npm run build

# Production stage
FROM public.ecr.aws/docker/library/node:18-alpine AS production

WORKDIR /app

# Copy package files and install production deps
COPY --from=builder /app/package*.json ./
RUN npm ci --only=production

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S kubamf -u 1001

# Copy backend server and shared services
COPY --from=builder /app/src/backend/ ./src/backend/
COPY --from=builder /app/src/shared/ ./src/shared/
# Copy built frontend to where the server expects it (../frontend relative to src/backend/)
COPY --from=builder /app/dist/frontend/ ./src/frontend/
# Copy generated documentation
COPY --from=builder /app/public/docs.json ./public/docs.json

# Ensure all source files are readable by the app user
RUN chmod -R a+rX ./src/ ./public/

USER kubamf

EXPOSE 3001

ENV NODE_ENV=production

CMD ["node", "src/backend/server.js"]