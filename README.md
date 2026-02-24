# Automate

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

## Quick Start

```bash
# 1. Start infra
cd docker && docker compose up -d

# 2. Install deps
bun install

# 3. Run migrations
bun run db:migrate

# 4. Start all services
bun run dev
```

Services:
- **Landing:** http://localhost:4321
- **App:** http://localhost:5173
- **API:** http://localhost:3001
- **API Health:** http://localhost:3001/health

## Environment

Copy `.env.example` to `.env` and fill in your API keys:

```bash
cp .env.example .env
```

## Project Structure

```text
automate/
├── apps/
│   ├── api/          # Hono REST API
│   ├── worker/       # BullMQ workers + cron scheduler
│   ├── landing/      # Astro landing pages
│   └── app/          # React + Vite + TanStack product app
├── packages/
│   ├── core/         # Shared types, Zod schemas, constants
│   └── ui/           # Shared React UI utilities/components
├── docker/           # Docker Compose for local dev
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

## License

Proprietary - Ligerian Labs © 2026
