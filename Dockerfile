# ==========================================
# KidSafe Cloud Container
# Lightweight, Zero-Dependency Node.js 20 Image
# ==========================================

FROM node:20-alpine

WORKDIR /app

# Copy server code and public assets
COPY server ./server
COPY shared ./shared

ENV NODE_ENV=production
ENV PORT=8080
ENV DATA_DIR=/app/data

RUN mkdir -p /app/data

EXPOSE 8080

CMD ["node", "server/server.js"]
