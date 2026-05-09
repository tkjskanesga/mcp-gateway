# Use the official Bun image
FROM oven/bun:latest

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json bun.lock ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy the rest of the application
COPY . .

# Ensure mcp.js is executable if needed, but Bun handles it
# Setting ENTRYPOINT allows passing arguments directly to docker run
ENTRYPOINT ["bun", "mcp.js"]
