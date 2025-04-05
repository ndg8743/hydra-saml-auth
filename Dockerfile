FROM node:18-slim AS build

WORKDIR /app
COPY package*.json ./
RUN npm i

FROM node:18-slim

# Install SQLite client for debugging if needed
RUN apt-get update && apt-get install -y --no-install-recommends \
    dumb-init \
    sqlite3 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /app/data /app/cert \
    && chown -R node:node /app

WORKDIR /app
USER node

COPY --from=build --chown=node:node /app/node_modules /app/node_modules
COPY --chown=node:node . .

ENV PORT=6969 \
    DB_PATH=/app/data/webui.db

EXPOSE 6969

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "index.js"]