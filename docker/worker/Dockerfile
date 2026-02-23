FROM oven/bun:1-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json bun.lock* bunfig.toml* ./
COPY packages/shared/package.json packages/shared/
COPY packages/worker/package.json packages/worker/
RUN bun install --frozen-lockfile || bun install

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY packages/shared packages/shared
COPY packages/worker packages/worker
RUN cd packages/shared && bun run build && cd ../worker && bun run build

FROM base AS runtime
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/worker/dist ./packages/worker/dist
COPY packages/shared/package.json packages/shared/
COPY packages/worker/package.json packages/worker/
COPY package.json ./

CMD ["bun", "run", "packages/worker/dist/index.js"]
