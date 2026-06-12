# Stage 1: Build the Vite application
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy the rest of the application
COPY . .

# Build the app for production (injects the API key into the bundle)
# To pass the API key during build:
# docker build --build-arg GEMINI_API_KEY="your-api-key" -t app-name .
ARG GEMINI_API_KEY
ENV GEMINI_API_KEY=$GEMINI_API_KEY
RUN npm run build

# Stage 2: Serve the app with Nginx
FROM nginx:alpine

# The Nginx alpine image has built-in support for env var substitution.
# It reads templates from /etc/nginx/templates/*.template and outputs them 
# to /etc/nginx/conf.d/*.conf before starting Nginx.
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

# Remove the default Nginx static assets
RUN rm -rf /usr/share/nginx/html/*

# Copy the built assets from the builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Cloud Run provides the PORT environment variable (default 8080)
ENV PORT=8080

EXPOSE ${PORT}

CMD ["nginx", "-g", "daemon off;"]
