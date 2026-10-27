# Node Lab 03 — From "works on my machine" to production-ready

> Interview question this lab trains: **"How do you structure and scale a Node.js application in
> production?"** (architecture, configuration, logging, health checks, graceful shutdown,
> horizontal scaling, containers)

`legacy/app.js` is a small Todo API that works, but could never be deployed with two replicas behind
a load balancer, and it drops requests every time it restarts. Turn it into a service you would be
comfortable putting on call for.

## Setup

```bash
npm install
docker compose up -d        # Redis for shared state
npm start                   # the legacy app on :3000
```

Requires Node 20+, Docker.

## What is wrong with `legacy/app.js`

Read it first and write down everything you find. You should spot at least: all state in memory
(todos, id counter, rate-limit counters), a hardcoded secret, `console.log` logging, no input
validation, inconsistent error responses (`"no"`, HTML 404s, a crash on unknown id in PATCH),
no graceful shutdown, config hardcoded, a single file with routing + auth + business logic + storage
mixed together.

## Your task

Build the production version in `src/` (keep `legacy/` untouched for comparison). Same API, but:

### 1. Structure
- Layers: HTTP (routes/controllers) → service → repository. The repository is the only layer that
  knows about Redis. Validation at the edge (zod or similar), domain errors in the service.
- Configuration from environment variables with validation at startup: `PORT`, `API_TOKEN`,
  `REDIS_URL`, `LOG_LEVEL`, `RATE_LIMIT_PER_MIN` (default 100). Missing `API_TOKEN` → process refuses
  to start with a clear message.
- Consistent error contract: every error is `{ "error": { "code": "...", "message": "..." } }` with
  the right status (400 validation, 401 auth, 404 not found, 429 rate limit, 500 unexpected).
  Unknown routes also return this shape.

### 2. Observability
- Structured JSON logs (pino) with one line per request containing: request id, method, path,
  status, duration ms. Request id is taken from the incoming `x-request-id` header or generated, and
  echoed back in the response header.
- `GET /health` (liveness: process is up) and `GET /ready` (readiness: Redis reachable). `/ready` must
  return 503 when Redis is down and during shutdown.

### 3. Graceful shutdown
On `SIGTERM`/`SIGINT`: stop accepting new connections, flip `/ready` to 503, let in-flight requests
finish (up to a timeout, e.g. 10 s), close Redis, exit 0. A forced exit with code 1 if the timeout
elapses. `npm run check:graceful` verifies this by starting your server, keeping 20 slow requests in
flight, sending SIGTERM and watching what happens.

### 4. Stateless, horizontally scalable
Todos, the id sequence and rate-limit counters live in Redis so that N instances behave as one.
`npm run check:stateless` runs against two instances (start them with `PORT=3001` and `PORT=3002`).

### 5. Containers & process management
- A multi-stage `Dockerfile` (production deps only, non-root user, `NODE_ENV=production`,
  `HEALTHCHECK`, `node` as PID 1 or `tini` — explain your choice in `NOTES.md`).
- `docker compose up --scale app=2` must work. Add the `app` service to `docker-compose.yml`.
- Bonus: run with `node:cluster` or PM2 in cluster mode and explain in `NOTES.md` when you'd use
  that versus multiple containers.

### Acceptance criteria

Set `START_CMD` if your start script differs (default is `npm start`, so point `npm start` at `src/`).

```bash
npm run check:graceful                      # starts your app on :3100 with REDIS_URL from env
PORT=3001 npm start & PORT=3002 npm start & # two instances
npm run check:stateless
```

- [ ] `npm run check:graceful` all green: 20 in-flight slow requests complete with 200, a new request
      after SIGTERM is refused or gets 503, process exits with code 0 within 10 s, stdout is JSON lines
- [ ] `npm run check:stateless` all green: create on A → read on B, update on B → visible on A,
      40 concurrent creates across both instances produce unique ids, delete on B → 404 on A,
      error shape consistent, rate limit shared across instances
- [ ] Starting without `API_TOKEN` fails fast with a clear message
- [ ] `/ready` returns 503 when Redis is stopped (`docker compose stop redis`) and 200 when it's back
- [ ] `docker compose up --build --scale app=2` starts two healthy replicas
- [ ] `NOTES.md` has: what was wrong with the legacy app, your folder structure and why, how you'd
      add a second entity (e.g. "projects") without touching existing files more than necessary
- [ ] `src/` has no `console.log` and no hardcoded secrets

### Stretch goals
- Add an OpenTelemetry trace per request and export to the console or Jaeger.
- Add a `GET /metrics` Prometheus endpoint with request duration histogram + event-loop lag.
- Add a `Makefile`/`npm` script that runs the whole check suite in CI (GitHub Actions with a Redis
  service container).

## What a senior answer sounds like

Separation of concerns so the business logic is testable without HTTP or Redis; 12-factor config;
structured logs with correlation ids; liveness vs readiness and why they differ; graceful shutdown
tied to the orchestrator's lifecycle (SIGTERM → drain → exit) so deploys are zero-downtime; stateless
processes so scaling is just "add replicas"; small, non-root images; and the difference between
scaling with cluster (one box) and replicas (many boxes).
