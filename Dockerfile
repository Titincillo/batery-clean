# Use Node.js 22 LTS
FROM node:22-alpine

# Working directory
WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy application code and SQLite database
COPY . .

# Expose server port
EXPOSE 3050

# Set production environment
ENV NODE_ENV=production
ENV PORT=3050

# Start application
CMD ["npm", "start"]
