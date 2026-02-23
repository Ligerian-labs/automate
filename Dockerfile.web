FROM oven/bun:1-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json bun.lock* bunfig.toml* ./
COPY packages/shared/package.json packages/shared/
COPY packages/web/package.json packages/web/
RUN bun install --frozen-lockfile || bun install

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY packages/shared packages/shared
COPY packages/web packages/web
RUN bun tsc -b packages/shared && cd packages/web && bun run build

FROM base AS runtime
RUN bun add -g serve
COPY --from=build /app/packages/web/dist ./dist

EXPOSE 4321
CMD ["serve", "-s", "dist", "-l", "4321"]
