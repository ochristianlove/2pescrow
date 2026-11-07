FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY apps/indexer/package.json apps/indexer/
RUN npm install --workspace=@2pescrow/indexer --workspace=@2pescrow/shared
COPY packages/shared packages/shared
COPY apps/indexer apps/indexer
RUN npm run build -w @2pescrow/shared && npm run build -w @2pescrow/indexer
WORKDIR /app/apps/indexer
CMD ["node", "dist/index.js"]
