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
    && mkdir -p /app/data /app/cert

WORKDIR /app
USER root

# Copy files
COPY --from=build /app/node_modules /app/node_modules
COPY . .

ENV PORT=6969 \
    DB_PATH=/app/data/webui.db

EXPOSE 6969

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "index.js"]