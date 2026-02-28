FROM oven/bun:1-alpine AS base
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
ARG VITE_API_URL=https://api.stepiq.sh
ENV VITE_API_URL=${VITE_API_URL}
ARG VITE_CLERK_PUBLISHABLE_KEY=
ENV VITE_CLERK_PUBLISHABLE_KEY=${VITE_CLERK_PUBLISHABLE_KEY}
ARG VITE_POSTHOG_KEY=phc_hmEYKj8OGt4Mm6hsOyn7cuBpJlIa8ubgzSmsuoRxMif
ENV VITE_POSTHOG_KEY=${VITE_POSTHOG_KEY}
COPY --from=deps /app .
COPY tsconfig.json ./
COPY packages/core packages/core
COPY packages/ui packages/ui
COPY apps/app apps/app
RUN cd apps/app && bun run build

FROM base AS runtime
RUN bun add -g serve
COPY --from=build /app/apps/app/dist ./dist

EXPOSE 5173
CMD ["serve", "-s", "dist", "-l", "5173"]
