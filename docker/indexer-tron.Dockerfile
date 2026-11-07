FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY apps/indexer-tron/package.json apps/indexer-tron/
RUN npm install --workspace=@2pescrow/indexer-tron --workspace=@2pescrow/shared
COPY packages/shared packages/shared
COPY apps/indexer-tron apps/indexer-tron
RUN npm run build -w @2pescrow/shared && npm run build -w @2pescrow/indexer-tron
WORKDIR /app/apps/indexer-tron
CMD ["node", "dist/index.js"]
