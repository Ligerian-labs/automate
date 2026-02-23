FROM oven/bun:1-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json bun.lock* bunfig.toml* ./
COPY packages/shared/package.json packages/shared/
COPY packages/api/package.json packages/api/
RUN bun install --frozen-lockfile || bun install

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY packages/shared packages/shared
COPY packages/api packages/api
RUN bun tsc -b packages/shared && bun tsc -b packages/api

FROM base AS runtime
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/api/dist ./packages/api/dist
COPY packages/shared/package.json packages/shared/
COPY packages/api/package.json packages/api/
COPY package.json ./

EXPOSE 3001
ENV PORT=3001
CMD ["bun", "run", "packages/api/dist/index.js"]
