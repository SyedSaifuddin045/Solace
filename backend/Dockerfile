FROM node:24-alpine

RUN apk add --no-cache python3 py3-pip ffmpeg

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

RUN pip3 install --break-system-packages yt-dlp==2026.8.19

COPY src/ ./src/

ENV NODE_ENV=production PORT=8080

RUN mkdir -p /app/uploads && chown -R node:node /app

# Run as non-root
USER node

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/ || exit 1

CMD ["node", "src/server.js"]