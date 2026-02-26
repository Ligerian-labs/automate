# Stepiq

**AI Pipeline Builder** - Chain models, write prompts, schedule everything.

By [Ligerian Labs](https://ligerianlabs.fr)

## Architecture

Monorepo with runtime apps and reusable packages:

| Path | Description | Tech |
|------|-------------|------|
| `apps/api` | REST API server | Hono, Drizzle, PostgreSQL |
| `apps/worker` | Pipeline executor + cron scheduler | BullMQ, Redis |
| `apps/landing` | Marketing website | Astro 5, Tailwind |
| `apps/app` | Product web app | React, Vite, TanStack Router + Query |
| `packages/core` | Shared types, schemas, constants | Zod, TypeScript |
| `packages/ui` | Shared UI/helpers for React apps | TypeScript, React |

## Quick Start (Manual Local Debug)

### 1. Create `.env`

From repo root:

```bash
cp .env.example .env
```

Then update `.env` to:

```env
DATABASE_URL=postgres://stepiq:stepiq@localhost:5433/stepiq
REDIS_URL=redis://localhost:6379
JWT_SECRET=local-dev-jwt-secret-change-me-please
# 64 hex chars (32 bytes), required for user secrets encryption
STEPIQ_MASTER_KEY=
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
CORS_ORIGIN=http://localhost:5173
PUBLIC_API_URL=http://localhost:3001
VITE_API_URL=http://localhost:3001
```

### 2. Start local infra

```bash
docker compose -f compose.yaml up -d
```

### 3. Install dependencies and run migrations

```bash
bun install
set -a; source .env; set +a
bun run db:migrate
```

### 4. Start services (4 terminals)

Terminal A (API):

```bash
set -a; source .env; set +a
bun run --filter @stepiq/api dev
```

Terminal B (Worker):

```bash
set -a; source .env; set +a
bun run --filter @stepiq/worker dev
```

Terminal C (App):

```bash
set -a; source .env; set +a
bun run --filter @stepiq/app dev
```

Terminal D (Landing):

```bash
set -a; source .env; set +a
bun run --filter @stepiq/landing dev
```

Services:
- **Landing:** http://localhost:4321
- **App:** http://localhost:5173
- **API:** http://localhost:3001
- **API Health:** http://localhost:3001/health

### 5. Verify

```bash
curl http://localhost:3001/health
```

Expected:

```json
{"status":"ok","version":"0.0.1"}
```

### 6. Stop infra (optional)

```bash
docker compose -f compose.yaml down
```

## Project Structure

```text
stepiq/
├── apps/
│   ├── api/          # Hono REST API
│   ├── worker/       # BullMQ workers + cron scheduler
│   ├── landing/      # Astro landing pages
│   └── app/          # React + Vite + TanStack product app
├── packages/
│   ├── core/         # Shared types, Zod schemas, constants
│   └── ui/           # Shared React UI utilities/components
├── compose.yaml      # Local dev infra (Postgres + Redis)
├── docker/           # Container files for other environments
└── biome.json        # Linter/formatter config
```

## API Endpoints

See [full spec](https://github.com/Ligerian-labs/brainstorm/blob/main/products/ai-pipelines/SPEC.md) for complete API documentation.

### Core routes:
- `POST /api/auth/register` - Sign up
- `POST /api/auth/login` - Sign in
- `GET /api/pipelines` - List pipelines
- `POST /api/pipelines` - Create pipeline
- `POST /api/pipelines/:id/run` - Execute pipeline
- `GET /api/runs/:id` - Get run details (with step-by-step logs)
- `GET /api/runs/:id/stream` - SSE real-time updates
- `POST /api/pipelines/:id/schedules` - Create cron schedule
- `GET /api/models` - List available models + pricing

## Master Key Rotation

Secrets are stored with envelope encryption and can be re-wrapped to a new master key.

1. Generate a new key (do not overwrite current key yet):

```bash
openssl rand -hex 32
```

2. Run a dry run:

```bash
ROTATE_OLD_MASTER_KEY="<current-64-hex>" \
ROTATE_NEW_MASTER_KEY="<new-64-hex>" \
ROTATE_NEW_KEY_VERSION=2 \
ROTATE_DRY_RUN=true \
bun run --filter @stepiq/api rotate:master-key
```

3. Run the real rotation:

```bash
ROTATE_OLD_MASTER_KEY="<current-64-hex>" \
ROTATE_NEW_MASTER_KEY="<new-64-hex>" \
ROTATE_NEW_KEY_VERSION=2 \
bun run --filter @stepiq/api rotate:master-key
```

4. Update runtime env (`STEPIQ_MASTER_KEY`) to the new key and restart API + worker.

## Dokploy Runbook (Rotation)

Recommended setup on Dokploy:
- API service env includes `STEPIQ_MASTER_KEY` (current key)
- Worker service env includes the same `STEPIQ_MASTER_KEY`
- Postgres and Redis envs are configured as usual

Rotation on Dokploy:
1. Open API service shell / one-off command runner.
2. Run dry run inside the API container:

```bash
ROTATE_OLD_MASTER_KEY="<current-64-hex>" \
ROTATE_NEW_MASTER_KEY="<new-64-hex>" \
ROTATE_NEW_KEY_VERSION=2 \
ROTATE_DRY_RUN=true \
bun run apps/api/dist/scripts/rotate-master-key.js
```

3. Run the real rotation (same command without `ROTATE_DRY_RUN=true`).
4. Update `STEPIQ_MASTER_KEY` in Dokploy env for **both API and worker** to the new key.
5. Redeploy/restart API and worker.

## License

Proprietary - Ligerian Labs © 2026
