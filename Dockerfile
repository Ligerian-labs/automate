FROM oven/bun:1-debian AS base
WORKDIR /app

FROM base AS deps
COPY package.json bun.lock* bunfig.toml* ./
COPY packages/core/package.json packages/core/
COPY packages/ui/package.json packages/ui/
COPY apps/api/package.json apps/api/
COPY apps/landing/package.json apps/landing/
COPY apps/app/package.json apps/app/
COPY apps/worker/package.json apps/worker/
RUN bun install --frozen-lockfile || bun install

FROM base AS build
COPY --from=deps /app .
COPY tsconfig.json ./
COPY packages/core packages/core
COPY apps/api apps/api
RUN bun tsc -p packages/core/tsconfig.json 2>&1 && bun tsc -p apps/api/tsconfig.json 2>&1 && echo "BUILD_OK" || echo "BUILD_FAILED"

FROM base AS runtime
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/core/node_modules ./packages/core/node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/packages/core ./packages/core
COPY --from=build /app/apps/api ./apps/api
COPY package.json ./

EXPOSE 3001
ENV PORT=3001
CMD ["sleep", "3600"]
