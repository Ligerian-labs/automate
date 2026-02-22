# Automate

**AI Pipeline Builder** — Chain models, write prompts, schedule everything.

By [Ligerian Labs](https://ligerianlabs.fr)

## Architecture

Monorepo with 4 packages:

| Package | Description | Tech |
|---------|-------------|------|
| `packages/shared` | Types, schemas, constants | Zod, TypeScript |
| `packages/api` | REST API server | Hono, Drizzle, PostgreSQL |
| `packages/worker` | Pipeline executor + cron scheduler | BullMQ, Redis |
| `packages/web` | Frontend | Astro 5, React, Tailwind |

## Quick Start

```bash
# 1. Start infra
cd docker && docker compose up -d

# 2. Install deps
npm install

# 3. Run migrations
npm run db:migrate

# 4. Start all services
npm run dev
```

Services:
- **Web:** http://localhost:4321
- **API:** http://localhost:3001
- **API Health:** http://localhost:3001/health

## Environment

Copy `.env.example` to `.env` and fill in your API keys:

```bash
cp .env.example .env
```

## Project Structure

```
automate/
├── packages/
│   ├── shared/       # Shared types, Zod schemas, constants
│   ├── api/          # Hono REST API
│   │   ├── src/
│   │   │   ├── db/         # Drizzle schema + migrations
│   │   │   ├── routes/     # API route handlers
│   │   │   ├── services/   # Business logic
│   │   │   ├── middleware/  # Auth, rate limiting
│   │   │   └── lib/        # Config, utilities
│   │   └── drizzle.config.ts
│   ├── worker/       # BullMQ workers + cron scheduler
│   │   └── src/
│   │       ├── executor.ts      # Pipeline execution engine
│   │       ├── model-router.ts  # Multi-provider LLM proxy
│   │       └── scheduler.ts     # Cron job scheduler
│   └── web/          # Astro frontend
│       └── src/
│           ├── pages/
│           ├── components/
│           └── layouts/
├── docker/           # Docker Compose for local dev
├── docs/             # Documentation
└── biome.json        # Linter/formatter config
```

## API Endpoints

See [full spec](https://github.com/Ligerian-labs/brainstorm/blob/main/products/ai-pipelines/SPEC.md) for complete API documentation.

### Core routes:
- `POST /api/auth/register` — Sign up
- `POST /api/auth/login` — Sign in
- `GET /api/pipelines` — List pipelines
- `POST /api/pipelines` — Create pipeline
- `POST /api/pipelines/:id/run` — Execute pipeline
- `GET /api/runs/:id` — Get run details (with step-by-step logs)
- `GET /api/runs/:id/stream` — SSE real-time updates
- `POST /api/pipelines/:id/schedules` — Create cron schedule
- `GET /api/models` — List available models + pricing

## License

Proprietary — Ligerian Labs © 2026
