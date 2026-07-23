FROM node:20-alpine

# Install build tools for native modules (like better-sqlite3)
RUN apk add --no-cache python3 make g++
# Install concurrently for running both services
RUN npm install -g concurrently tsx typescript

WORKDIR /app

# Copy package.json files first to leverage Docker cache
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/

# Install backend dependencies
WORKDIR /app/backend
RUN npm install --legacy-peer-deps

# Install frontend dependencies
WORKDIR /app/frontend
RUN npm install --legacy-peer-deps

# Copy full source
WORKDIR /app
COPY backend/ ./backend/
COPY frontend/ ./frontend/

# Define environment variables early so build steps can use them
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL="file:/config/dev.db"

# Generate Prisma client for backend
WORKDIR /app/backend
RUN npx prisma generate

# Build frontend
WORKDIR /app/frontend
RUN npm run build

# Setup entrypoint directory
WORKDIR /app

# Expose ports (Next.js default is 3000, Express is 4000)
EXPOSE 3000 4000

# Start both services using concurrently
CMD ["concurrently", "\"cd backend && npx prisma db push --accept-data-loss && npx tsx src/index.ts\"", "\"cd frontend && npm run start\""]
