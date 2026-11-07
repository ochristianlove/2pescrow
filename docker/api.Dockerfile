FROM node:20-alpine
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN npm install --workspace=@2pescrow/api --workspace=@2pescrow/shared
COPY packages/shared packages/shared
RUN npm run build -w @2pescrow/shared
COPY apps/api apps/api
WORKDIR /app/apps/api
RUN npx prisma generate
RUN npm run build
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
