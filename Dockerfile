# Use Node.js 20 as base image
FROM node:20-slim AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm install

# Copy source code and config files
COPY src ./src
COPY tsconfig.json ./

# Build the project
RUN npm run build

# Start with a fresh image for running
FROM node:20-slim AS runner

# Install necessary system dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    # Chrome dependencies
    chromium \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcb-dri3-0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    xdg-utils \
    # SQLite dependencies
    sqlite3 \
    python3 \
    make \
    g++ \
    # Clean up
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /root/.cache/puppeteer

# Set working directory
WORKDIR /app

# Copy build artifacts and dependencies
COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./

# Set Puppeteer environment variables
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV CHROME_PATH=/usr/bin/chromium

# Create directory for SQLite database
RUN mkdir -p /root/.perplexity-mcp

# Create chrome user and group
RUN groupadd -r chrome && useradd -r -g chrome -G audio,video chrome \
    && mkdir -p /home/chrome/Downloads \
    && chown -R chrome:chrome /home/chrome \
    && chown -R chrome:chrome /root/.cache/puppeteer

# Give chrome user access to required directories
RUN chown -R chrome:chrome /app

# Switch to non-root user for security
USER chrome

# Start the server
CMD ["node", "build/index.js"]
