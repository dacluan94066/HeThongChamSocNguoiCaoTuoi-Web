# Dockerfile for Node.js Backend Server
FROM node:20-alpine

WORKDIR /app

# Cai dat dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source code
COPY . .

# Expose port
EXPOSE 5000

CMD ["node", "src/server.js"]
