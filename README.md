# Node Lab 03 — From MVP to production-ready (NestJS + Prisma + Postgres + Redis)

> Interview question: **"How do you structure and run a Node.js service in production?"**
> (configuration, logging, health/readiness, graceful shutdown, horizontal scaling, containers)

## The scenario

The Tasks API started as an MVP and is now being moved to Kubernetes with **two replicas** behind a
load balancer and rolling deploys. The first attempt went badly: each replica showed different
tasks, every deploy returned errors to users for a few seconds, the rate limit was "sometimes 100,
sometimes 200", and the logs were unreadable in Datadog. Prisma and Postgres are already wired up
(`PrismaModule`, `prisma/schema.prisma`, migration + seed) — nobody got around to using them.

## Setup

```bash
npm install
cp .env.example .env
npm run db:up          # Postgres on :5443, Redis on :6381
npm run db:setup       # migration + 3 seeded tasks
npm run start:dev      # :3000 (hardcoded… that's one of the problems)
```

Requires Node 20+ and Docker.

## What you get

```
src/main.ts                          no shutdown hooks, hardcoded port, console.log
src/health.controller.ts             GET /health → "OK" (text). No readiness probe.
src/common/rate-limit.middleware.ts  in-memory counters per process
src/common/auth.guard.ts             hardcoded token
src/tasks/tasks.service.ts           in-memory array (ignores Prisma)
src/tasks/tasks.controller.ts        no validation, crashes on unknown id, inconsistent responses
src/prisma/                          PrismaService (disconnects in onModuleDestroy — think about when that runs)
prisma/schema.prisma                 Task model, migration and seed ready to use
scripts/graceful-check.mjs           SIGTERM test
scripts/stateless-check.mjs          two-replica test
```

Read every file and list what you would not ship. Then fix it.

## Your task

1. **Config**: `PORT`, `API_TOKEN`, `DATABASE_URL`, `REDIS_URL`, `RATE_LIMIT_PER_MIN` (default 100)
   from the environment (`@nestjs/config` with validation is the idiomatic way). Missing
   `API_TOKEN` → the process refuses to start with a clear message.
2. **Persistence**: `TasksService` uses Prisma. Validation with DTOs + `ValidationPipe`
   (`class-validator`) — `POST /tasks` without a title is a 400, unknown id is a 404.
3. **Error contract**: a global exception filter so every error is
   `{ "error": { "code": "...", "message": "..." } }` with the right status (400/401/404/429/500).
4. **Logging**: structured JSON logs (e.g. `nestjs-pino`), one line per request with request id,
   method, path, status and duration. No `console.log` left in `src/`.
5. **Health vs readiness**: `GET /health` (process alive) and `GET /ready` (Postgres + Redis
   reachable, 503 otherwise and during shutdown). `@nestjs/terminus` is a good fit.
6. **Graceful shutdown**: `app.enableShutdownHooks()` and make sure that on `SIGTERM` the server
   stops accepting connections, in-flight requests finish (the 2 s `/tasks/export/slow` must still
   answer 200), **then** Prisma/Redis disconnect, and the process exits 0. Hint: look at the order
   in which Nest calls `onModuleDestroy`, `beforeApplicationShutdown`, `onApplicationShutdown` and
   closes the HTTP server. Where should Prisma disconnect?
7. **Shared rate limit** in Redis so two replicas enforce the same limit.
8. **Container**: multi-stage `Dockerfile` (prod deps only, non-root user, `HEALTHCHECK`) and
   `docker compose up --build --scale api=2` works against the compose Postgres/Redis.

### Acceptance criteria

```bash
npm run build
npm run check:graceful                         # starts `node dist/main` on :3100 for you
PORT=3001 node dist/main & PORT=3002 node dist/main &
npm run check:stateless
```

- [ ] `check:graceful` all green: 20 in-flight slow requests complete with 200, a new request after
      SIGTERM is refused or 503, exit code 0 within 10 s, stdout is JSON lines
- [ ] `check:stateless` all green: data created on one replica is visible on the other, unique ids
      under concurrent creates, consistent error shape, rate limit shared across replicas
- [ ] Starting without `API_TOKEN` fails fast with a clear message
- [ ] `/ready` returns 503 when Postgres is stopped (`docker compose stop postgres`) and 200 when back
- [ ] `docker compose up --build --scale api=2` starts two healthy replicas
- [ ] `NOTES.md`: what was wrong, your folder layout, the shutdown sequence you implemented and why,
      and when you would use `cluster`/PM2 instead of more replicas
- [ ] No `console.log` and no hardcoded secret in `src/`

### Stretch goals

- OpenTelemetry tracing per request (console exporter is enough), `GET /metrics` for Prometheus.
- A GitHub Actions workflow that runs both checks with Postgres and Redis service containers.

## What a senior answer sounds like

Separate transport (controllers), business logic (services) and persistence (Prisma) so the core is
testable; 12-factor config; structured logs with correlation ids; liveness ≠ readiness; graceful
shutdown wired to the orchestrator's lifecycle (SIGTERM → stop accepting → drain → close
connections → exit 0) so deploys are zero-downtime; stateless processes so scaling is "add
replicas"; small non-root images; and knowing the difference between scaling a box with `cluster`
and scaling a fleet with replicas.
