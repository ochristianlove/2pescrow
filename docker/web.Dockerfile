FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN npm install --workspace=@2pescrow/web --workspace=@2pescrow/shared
COPY packages/shared packages/shared
RUN npm run build -w @2pescrow/shared
COPY apps/web apps/web
WORKDIR /app/apps/web
ARG VITE_API_URL=
ARG VITE_WALLETCONNECT_PROJECT_ID=
ARG VITE_TRON_RPC_URL=https://api.trongrid.io
ARG VITE_TRON_NETWORK=
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_WALLETCONNECT_PROJECT_ID=$VITE_WALLETCONNECT_PROJECT_ID
ENV VITE_TRON_RPC_URL=$VITE_TRON_RPC_URL
ENV VITE_TRON_NETWORK=$VITE_TRON_NETWORK
RUN npm run build

FROM node:20-alpine
WORKDIR /app
RUN npm i -g serve
COPY --from=build /app/apps/web/dist ./dist
COPY docker/web-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
EXPOSE 3001
ENV API_PUBLIC_URL=
ENV VITE_API_URL=
# Browser must reach this URL (host/public), not http://api:3000.
ENTRYPOINT ["/entrypoint.sh"]
