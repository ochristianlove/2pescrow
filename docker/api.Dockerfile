FROM node:20-alpine
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN npm install --workspace=@2pescrow/api --workspace=@2pescrow/shared
COPY packages/shared packages/shared
RUN npm run build -w @2pescrow/shared
# SOURCE_REV is the git commit being built. A new value forces the compile
# even when an older COPY layer would otherwise be reused.
ARG SOURCE_REV=local
COPY apps/api apps/api
WORKDIR /app/apps/api
RUN npx prisma generate
RUN echo "Building API source ${SOURCE_REV}" && npm run build
EXPOSE 3000
CMD ["sh", "scripts/start.sh"]
