FROM node:22-alpine

WORKDIR /app
COPY server.mjs /app/server.mjs

ENV PORT=3000 \
    DATA_DIR=/data \
    NODE_ENV=production

EXPOSE 3000
VOLUME ["/data"]

CMD ["node", "/app/server.mjs"]
