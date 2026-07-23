FROM node:20-alpine

# Install concurrently for running both services
RUN npm install -g concurrently tsx typescript

WORKDIR /app

# Copy package.json files first to leverage Docker cache
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/

# Install backend dependencies
WORKDIR /app/backend
RUN npm ci

# Install frontend dependencies
WORKDIR /app/frontend
RUN npm ci

# Copy full source
WORKDIR /app
COPY backend/ ./backend/
COPY frontend/ ./frontend/

# Generate Prisma client for backend
WORKDIR /app/backend
RUN npx prisma generate

# Build frontend
WORKDIR /app/frontend
RUN npm run build

# Setup entrypoint directory
WORKDIR /app

# Define environment variables
ENV NODE_ENV=production
ENV PORT=4000
ENV NEXT_TELEMETRY_DISABLED=1

# Expose ports (Next.js default is 3000, Express is 4000)
EXPOSE 3000 4000

# Start both services using concurrently
CMD ["concurrently", "\"cd backend && npx tsx src/index.ts\"", "\"cd frontend && npm run start\""]
