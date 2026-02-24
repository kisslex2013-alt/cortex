FROM node:22-alpine

# Set working directory
WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package requirements
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# Copy tsconfigs and all packages source code
COPY tsconfig.json vitest.config.ts eslint.config.js ./
COPY packages ./packages

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build the entire monorepo
RUN pnpm build
