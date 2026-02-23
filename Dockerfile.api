FROM node:22-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY packages/api/package.json packages/api/
RUN npm install --legacy-peer-deps --workspace=packages/shared --workspace=packages/api --include-workspace-root

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY packages/shared packages/shared
COPY packages/api packages/api
RUN npm run build -w packages/shared && npm run build -w packages/api

FROM base AS runtime
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/api/dist ./packages/api/dist
COPY packages/shared/package.json packages/shared/
COPY packages/api/package.json packages/api/
COPY package.json ./

EXPOSE 3001
ENV PORT=3001
CMD ["node", "packages/api/dist/index.js"]
