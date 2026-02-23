FROM oven/bun:1-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json bun.lock* bunfig.toml* ./
COPY packages/shared/package.json packages/shared/
COPY packages/api/package.json packages/api/
COPY packages/web/package.json packages/web/
COPY packages/worker/package.json packages/worker/
RUN bun install --frozen-lockfile || bun install

FROM base AS build
COPY --from=deps /app .
COPY tsconfig.json ./
COPY packages/shared packages/shared
COPY packages/web packages/web
RUN bun tsc -p packages/shared/tsconfig.json && cd packages/web && bun run build

FROM base AS runtime
RUN bun add -g serve
COPY --from=build /app/packages/web/dist ./dist

EXPOSE 4321
CMD ["serve", "-s", "dist", "-l", "4321"]
