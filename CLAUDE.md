# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

SentinelAI (OpenInference) — a self-hosted AI gateway and observability platform. It routes requests to LLMs, enforces security policies, retrieves enterprise documents (RAG), runs agent workflows, and records full traces. A React dashboard (`web/`) is served by the gateway in production; REST APIs live under `/v1`.

## Commands

```bash
# Install all workspace dependencies
npm install

# Run a single service in dev mode
npm run dev -w @sentinelai/gateway
npm run dev -w @sentinelai/ingestion-worker
npm run dev -w @sentinelai/eval-worker
npm run dev -w @openinference/web   # Vite dev server for the dashboard

# Apply pending DB migrations (also runs automatically on gateway container start)
npm run migrate -w @sentinelai/gateway

# Type-check everything
npm run typecheck

# Build everything
npm run build

# Start infrastructure (Postgres + Redis) only
docker compose up postgres redis -d

# Start full stack
docker compose up -d

# Reset database (drops + recreates)
docker compose down -v && docker compose up postgres -d
```

## Architecture

This is an npm workspace monorepo with three backend services, a React dashboard, and one shared types package.

```
web/                       — React dashboard (Vite); built into gateway image
shared/                    — Shared TypeScript types + queue name constants
services/
  gateway/                 — Fastify HTTP server (port 3000) + SPA static host
  ingestion-worker/        — BullMQ worker: chunks + embeds documents
  eval-worker/             — BullMQ worker: scores LLM response quality
infra/
  postgres/init.sql        — Full DB schema (run once on fresh DB)
  nginx/nginx.conf         — Reverse proxy config
docker-compose.yml         — Full local stack
```

### Request Flow (gateway)

```
POST /v1/chat
  → auth plugin (SHA-256 API key lookup)
  → rate-limit plugin (Redis, per-tenant)
  → guardrails service (injection detection, PII redaction)
  → router service (picks provider/model, fallback logic)
  → llm service (OpenAI / Anthropic / Groq abstraction)
  → persist llm_requests row
  → async: flush trace_spans to DB
  → async: enqueue eval job to BullMQ
  → return response
```

### Queue Architecture

- **INGEST queue** (`@sentinelai/shared` → `QUEUES.INGEST`): Gateway enqueues when a document is uploaded. Ingestion worker dequeues, chunks with `chunker.ts`, embeds in batches via OpenAI, persists `document_chunks` with `vector` column.
- **EVAL queue** (`QUEUES.EVAL`): Gateway enqueues after every successful chat response. Eval worker scores faithfulness/relevance/coherence using an LLM judge, stores result in `eval_results`.

### Database

PostgreSQL with `pgvector`. Key tables:
- `tenants`, `api_keys` — multi-tenant auth
- `llm_requests` — one row per request, full audit trail
- `trace_spans` — OTel-style spans linked by `trace_id`
- `document_chunks` — chunked text + `vector(1024)` embedding column (Mistral embed)
- `users` — web login (email/password or Google OAuth)
- `eval_results` — per-request quality scores
- `audit_logs` — append-only, no UPDATE/DELETE

Vector search uses `ivfflat` index with cosine distance (`<=>` operator).

### Key Design Decisions

- **API key + JWT auth** — API keys are SHA-256 hashed at storage; web users get JWTs from `/v1/auth`.
- **Migrations on gateway start** — `migrate.js` applies `services/gateway/migrations/*.sql` before the server listens.
- **Provider abstraction** in `services/llm.ts` — add a new provider by adding a case there and updating `COST_TABLE`.
- **Routing rules** in `services/router.ts` — pure function, easy to extend with cost/latency-based rules.
- **Guardrails** in `services/guardrails.ts` — regex-based injection/PII checks run before every LLM call.
- **Spans are fire-and-forget** — `flushSpans()` is called without `await` so it never blocks the request response.
- **Eval is async** — always enqueued after response is sent; failures are logged but don't affect the client.

## Environment

Copy `.env.example` to `.env` and fill in at minimum `JWT_SECRET` and at least one LLM provider key. The seed in `init.sql` creates a dev tenant and API key `sentinel-dev-key`.

```bash
cp .env.example .env
# then edit .env
```

Test the gateway with:
```bash
curl -X POST http://localhost:3000/v1/chat \
  -H "X-Api-Key: sentinel-dev-key" \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "Hello"}]}'
```

API docs auto-generated at `http://localhost:3000/api-docs`.

## Branches & Deployment

Three branches: **`dev`** (active work) → **`main`** (integration/staging) → **`production`** (live releases). Promote with merges in that order.

**CI/CD is in place — do NOT manually SSH to deploy.** `.github/workflows/deploy.yml` auto-deploys on every push to `production`: it SSHes to the droplet, resets to `origin/production`, rebuilds the Docker images, restarts nginx, and health-checks the gateway. So the deploy flow is just:

```bash
# from production branch, after merging main → production
git push origin production    # GitHub Actions deploys automatically
```

`dev` and `main` do not deploy anything. Manual SSH to the droplet (`root@64.227.178.3`, checkout at `/opt/sentinelai/SentinelAI`) is reserved for **emergencies only** — e.g. the pipeline is broken, the site is down and you need to inspect logs/containers, or you must roll back faster than a revert+push. In normal operation, pushing to `production` handles everything.
