FROM node:20-slim
WORKDIR /app
RUN npm i -g bun
COPY package.json bun.lock* bunfig.toml* ./
COPY packages/core/package.json packages/core/
COPY packages/ui/package.json packages/ui/
COPY apps/api/package.json apps/api/
COPY apps/landing/package.json apps/landing/
COPY apps/app/package.json apps/app/
COPY apps/worker/package.json apps/worker/
RUN bun install --frozen-lockfile || bun install
COPY tsconfig.json ./
COPY packages/core packages/core
COPY apps/api apps/api
RUN bun tsc -p packages/core/tsconfig.json && bun tsc -p apps/api/tsconfig.json
EXPOSE 3001
ENV PORT=3001
CMD ["bun", "run", "apps/api/dist/index.js"]
