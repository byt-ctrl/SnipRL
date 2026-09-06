# Execution Checklist - SnipRL: URL Shortener with Analytics

## Progress Tracker

| Phase               | WPs        | Status     |
| ------------------- | ---------- | ---------- |
| 0. Foundation       | Step 1-4   | [ ]        |
| 1. Data layer + IDs | Step 5-7   | [x]        |
| 2. Core HTTP API    | Step 8-11  | [x]        |
| 3. Caching          | Step 12-14 | [ ]        |
| 4. Analytics        | Step 15-20 | [ ]        |
| 5. Abuse/security   | Step 21-25 | [ ]        |
| 6. Frontend         | Step 26-29 | [ ]        |
| 7. QA               | Step 30-33 | [ ]        |
| 8. Observability    | Step 34-36 | [ ]        |
| 9. Compliance       | Step 37-39 | [ ]        |
| 10. Deploy + launch | Step 40-43 | [ ]        |
| 11. Post-launch     | Step 44    | [ ]        |
| **Total**           | **44 WPs** | **0 / 44** |

---

# Phase 0 - Foundation

## Step 1 Repository and Repository Standards

- [x] Repository initialized as a monorepo at `$ROOT` (branch: `main`)
- [x] `.gitignore` covers `node_modules`, `.env*`, build output, coverage, geo-IP data files
- [x] `README.md` written (purpose, stack, dev setup, environment matrix)
- [x] `LICENSE` added (MIT)
- [x] Branch protection enabled on `main`: PR required, CI required, no direct pushes
- [x] Conventional Commits standard documented in README
- [x] `Verify:` `git status` clean; no generated files tracked

## Step 2 Monorepo Layout and Toolchain

- [x] pnpm workspaces configured: `apps/api`, `apps/web`, `packages/shared`
- [x] `apps/api` scaffolded (Fastify + TypeScript, starter code stripped)
- [x] `apps/web` scaffolded (Vite + React + TS, starter code stripped)
- [x] `packages/shared` contains TypeScript types (Link, ClickEvent, API DTOs)
- [x] Zod validation schemas added to `packages/shared`
- [x] Root scripts added: `dev`, `build`, `test`, `lint`, `typecheck`, `db:migrate`
- [x] Node engine pinned (`.nvmrc` + `engines`)
- [x] ESLint flat config (strict + typescript-eslint + react-hooks)
- [x] Prettier config + `.prettierignore`
- [x] Husky + lint-staged pre-commit gate (format + lint + typecheck)
- [x] Commitlint commit-msg hook
- [x] `Verify:` `pnpm dev` boots both apps
- [x] `Verify:` `pnpm typecheck` and `pnpm lint` pass
- [x] `Verify:` a type imported from `packages/shared` resolves in both apps

## Step 3 Local Development Environment

- [ ] PostgreSQL 16 installed natively (Homebrew / apt / dnf / official installer), listening on `localhost:5432`
- [ ] Local Postgres role + database created (`sniprl` / `sniprl_dev`) with a known password
- [ ] Redis 7 installed natively, listening on `localhost:6379`, configured to start on boot
- [ ] `.env.example` created: `DATABASE_URL`, `REDIS_URL`, `PORT`, `APP_BASE_URL`, `PUBLIC_SITE_URL`
- [ ] `.env` populated locally from example (gitignored)
- [ ] `Verify:` `pg_isready -h localhost -p 5432` returns `accepting connections`
- [ ] `Verify:` `redis-cli ping` returns `PONG`
- [ ] `docs/local-setup.md` committed with per-OS install commands (macOS, Ubuntu/Debian, Fedora, Windows)

## Step 3a Local Service Provisioning Reference

> Fills the role previously played by `docker-compose.yml`. Each developer runs Postgres and Redis natively on their machine; no containers in the dev loop.

- [ ] `docs/local-setup.md` enumerates the supported install path per OS
- [ ] macOS section: `brew install postgresql@16 redis` + `brew services start ...`
- [ ] Ubuntu/Debian section: `apt-get install postgresql-16 redis-server` + `systemctl enable --now ...`
- [ ] Fedora section: `dnf install postgresql-16 redis` + `systemctl enable --now ...`
- [ ] Windows section: official Postgres installer + Memurai or Microsoft `redis-windows` port, run as services
- [ ] Optional fallback: WSL2 Ubuntu on Windows (no Windows-native services)
- [ ] One-time DB bootstrap script committed at `scripts/db-bootstrap.sh` (creates role + db, enables `citext`, applies first migration)
- [ ] Reset recipe documented: drop + recreate `sniprl_dev`, re-run migrations
- [ ] `Verify:` fresh laptop, follow docs from scratch → API boots and `/health` returns 200 in under 15 minutes
- [ ] `Verify:` `pnpm dev` runs without any container runtime installed on the host

## Step 4 CI Pipeline

- [ ] GitHub Actions workflow `.github/workflows/ci.yml` on push/PR
- [ ] `lint` job added
- [ ] `typecheck` job added
- [ ] `test` job added with ephemeral Postgres + Redis provisioned per run (hosted service on the CI runner, isolated schema/namespace per job)
- [ ] `build` job added
- [ ] Deploy artifact job on merge to `main` (pnpm build output uploaded, host pulls artifact on deploy)
- [ ] pnpm store caching for fast installs
- [ ] `Verify:` CI green on a feature branch
- [ ] `Verify:` deploy artifact produced on merge to `main`

**Phase 0 complete: [ ]**

---

# Phase 1 - Data Layer and ID System

## Step 5 Schema and Migrations

- [x] Prisma installed and configured in `apps/api`
- [x] `links` table defined: `id` (bigserial PK), `short_code` (unique, citext), `long_url` (text NOT NULL), `management_token` (unique NOT NULL), `email`, `custom_alias` (default false), `expires_at`, `max_clicks`, `password_hash`, `created_at` (default now())
- [x] `click_events` table defined: `id` (bigserial PK), `link_id` (FK → links), `clicked_at`, `referrer`, `device_type`, `browser`, `os`, `country`, `city`, `ip_hash`, `is_bot` (default false)
- [x] Unique index on `links.short_code`
- [x] Composite index on `click_events(link_id, clicked_at)`
- [x] `citext` extension enabled for case-insensitive `short_code`
- [x] First migration created and committed
- [x] `db:migrate` script runs `prisma migrate deploy`
- [x] `Verify:` migration applies cleanly on a fresh database
- [x] `Verify:` reset + migrate reproduces schema (`\d links` shows correct columns/indexes)

## Step 6 Base62 Encoding Module

- [x] `packages/shared/base62.ts` written: `encode(num: bigint): string`
- [x] `decode(str: string): bigint` written
- [x] Alphabet `0-9a-zA-Z` chosen and order documented (frozen)
- [x] Padding contract defined: ≥ 1 char; generated codes padded to 7
- [x] Property tests: round-trip random 64-bit values
- [x] Property tests: boundaries 1, 62, 62⁷−1
- [x] `Verify:` `pnpm test` green for base62 suite

## Step 7 Short-Code Generation and Uniqueness

- [x] Insert → encode → update implemented inside a single transaction
- [x] `short_code = base62.encode(id)` applied after insert returns the id
- [x] Rationale comment/docs added: UUID/hash schemes rejected (longer codes, collisions)
- [x] `Verify:` inserting 5 links yields 5 distinct codes (shortest for small ids)
- [x] `Verify:` no duplicate `short_code` possible (unique constraint + construction)

**Phase 1 complete: [x]**

---

# Phase 2 - Core HTTP API

## Step 8 Application Bootstrap

- [x] Fastify instance created with env validation (`DATABASE_URL`, `REDIS_URL`, `PORT`, `APP_BASE_URL`)
- [x] Pino logger: pretty in dev, JSON in prod
- [x] Request-id propagated on every log line
- [x] Redaction configured: `authorization`, `managementToken`, `apiKey`, cookies
- [x] Global error handler: `ZodError` → 400 with field errors
- [x] Global error handler: unknown → 500 with sanitized body
- [x] Structured 404 for unknown routes
- [x] `GET /health` returns `{ ok: true, db: "up" }` (SELECT 1)
- [x] Graceful shutdown on SIGTERM (drain connections, flush logger)
- [x] `Verify:` `pnpm dev` boots; `/health` → 200
- [x] `Verify:` unknown route → structured 404 JSON

## Step 9 Link Creation Endpoint

- [x] Zod contract: `{ longUrl, customAlias?, expiresAt?, maxClicks?, email?, password? }`
- [x] `longUrl` validation: http/https only, parseable, ≤ 2048 chars, no embedded credentials
- [x] URL normalization: trim, strip default ports, optional fragment/UTM stripping (configurable)
- [x] Management token: `randomBytes(32).toString('base64url')`
- [x] Token returned in the response exactly once
- [x] Transactional insert (link row + short code encode)
- [x] Response: `{ shortCode, shortUrl, managementToken, createdAt }`
- [x] `Verify:` curl creates a link and returns a token
- [x] `Verify:` invalid URL → 400 with field-level error
- [x] `Verify:` tokens unique per link (DB constraint)

## Step 10 Redirect Endpoint (Hot Path)

- [x] `GET /:shortCode` route registered after all `/api/*` routes
- [x] Lookup by `short_code`
- [x] Hit → `302` with correct `Location`
- [x] `Cache-Control: no-store` set on redirect responses
- [x] Miss → 404 landing page
- [x] Expired (`expires_at` passed or `max_clicks` reached) → 410 Gone landing page
- [x] Password scaffold: 403 landing page when `password_hash` exists (full support deferred to Step 44)
- [x] No click recording yet (comes in Step 15)
- [x] `Verify:` `curl -I` shows `302` + `Location` + `Cache-Control: no-store`
- [x] `Verify:` unknown code → 404; expired link → 410

## Step 11 Management API (Token-Authenticated)

- [x] `GET /api/links/:shortCode/stats` - metadata + total clicks
- [x] `PATCH /api/links/:shortCode` - update `long_url`, `expires_at`, `max_clicks`, `email`
- [x] PATCH validates with the same rules as creation
- [x] `DELETE /api/links/:shortCode` - soft delete (`deleted_at` migration) → 204
- [x] Auth middleware with `crypto.timingSafeEqual`
- [x] Token value absent from all logs
- [x] `Verify:` no token → 401; wrong token → 401
- [x] `Verify:` correct token → full CRUD works
- [x] `Verify:` grep logs for token value → no match

**Phase 2 complete: [x]**

---

# Phase 3 - Caching and Performance

## Step 12 Redis Client Layer

- [x] `ioredis` singleton wired to `REDIS_URL`
- [x] Retry/backoff lifecycle with reconnect logging
- [x] Fail-fast on invalid config at boot
- [x] Helper module: `get`, `set`, `del`, `incr`, `hset/hget` with JSON serialization
- [x] Degradation contract: Redis outage must not crash the app
- [ ] `Verify:` smoke get/set against local Redis
- [ ] `Verify:` simulated Redis outage → app still serves redirects from DB

## Step 13 Cache-Aside on the Redirect Path

- [x] Key scheme `link:{shortCode}` → JSON `{ longUrl, expiresAt, maxClicks, passwordHash }`
- [x] TTL 24h, refreshed on every hit (`SET ... EX 86400`)
- [x] Flow: cache hit → 302 immediately
- [x] Flow: cache miss → DB read → populate → 302
- [x] Write-through: set cache on create/update
- [x] Cache entry deleted on link delete
- [x] Corrupt cache value falls back to DB gracefully
- [x] Hit/miss counters emitted (debug level)
- [ ] `Verify:` second request for same code skips DB (query counter)
- [ ] `Verify:` after delete, first request is a cache miss

## Step 14 Cache Telemetry

- [x] `redirect_cache_hits` / `redirect_cache_misses` counters exposed (`GET /metrics` or log emission)
- [x] Ops note committed: expected ratio + action on decline (eviction tuning, capacity)
- [x] `Verify:` counters move under a mixed workload

**Phase 3 complete: [ ]**

---

# Phase 4 - Analytics Pipeline

## Step 15 Non-Blocking Click Event Capture

- [ ] Event object built in redirect handler: `{ linkId, shortCode, clickedAt, referrer, userAgent, ip }`
- [ ] `LPUSH analytics:queue <json>` - fire-and-forget
- [ ] Enqueue wrapped in try/catch; never blocks or fails the redirect
- [ ] Queue depth sampled (`LLEN analytics:queue`)
- [ ] Redis failure behavior: log + drop, redirects unaffected (documented)
- [ ] `Verify:` 1000 redirects → 1000 events in queue
- [ ] `Verify:` redirect latency unchanged vs. no-op enqueue (measure in Step 33)

## Step 16 Analytics Worker (Drain + Batch Insert)

- [ ] Standalone worker process `apps/api/src/worker` (separate process)
- [ ] `BRPOP analytics:queue` with 1s timeout
- [ ] Batch: ≤ 500 events or 5s, whichever first
- [ ] Batched `createMany` into `click_events`
- [ ] Partial failure: re-push with retry counter (max 3), then dead-letter log
- [ ] Idempotent inserts (skip existing id)
- [ ] Worker metrics: processed count, batch size distribution, error rate
- [ ] Graceful shutdown: drain remaining batch before exit
- [ ] `Verify:` worker drains a populated queue into DB
- [ ] `Verify:` crash mid-drain loses no acknowledged events
- [ ] `Verify:` no duplicate rows after rerun

## Step 17 User-Agent Enrichment

- [ ] UA parsing added in worker (`ua-parser-js`)
- [ ] `device_type` ∈ {mobile, tablet, desktop, unknown}
- [ ] `browser` and `os` mapped
- [ ] Fixture suite: iPhone Safari, Android Chrome, desktop Edge, Googlebot, + 6 more
- [ ] `Verify:` ≥ 10 UA fixtures parse to expected values
- [ ] `Verify:` crawlers classified as bots

## Step 18 Bot Classification and IP Hashing

- [ ] Crawler detection regex list (Googlebot, bingbot, Twitterbot, etc.) → `is_bot = true`
- [ ] `ip_hash` = SHA-256(IP + per-deployment salt), base64url
- [ ] No code path stores a raw IP
- [ ] Retention window for `ip_hash`/referrer documented (finalized in Step 38)
- [ ] `Verify:` crawler fixtures → `is_bot = true`
- [ ] `Verify:` `ip_hash` not reversible to the IP

## Step 19 Geo-IP Lookup

- [ ] GeoLite2-City file download process defined (license per MaxMind terms)
- [ ] Geo data gitignored; fetched at deploy/CI
- [ ] `@maxmind/geoip2-node` lookup in worker
- [ ] Fallback to `unknown` country/city on miss
- [ ] In-memory LRU cache for repeated IPs
- [ ] `Verify:` known test IPs resolve to expected country
- [ ] `Verify:` private/unknown IPs → `unknown`
- [ ] `Verify:` worker throughput stays within budget

## Step 20 Analytics Query API

- [ ] `GET /api/links/:shortCode/analytics` (token-auth)
- [ ] Query params: `from`, `to`, `tz` (default UTC)
- [ ] Total clicks aggregation
- [ ] Daily series via `date_trunc('day', clicked_at)`
- [ ] Top-10 referrers and top-10 countries
- [ ] Device breakdown
- [ ] Bot/human split (`is_bot` excluded from human series)
- [ ] Aggregate responses cached in Redis (60s TTL)
- [ ] Response shapes typed in `packages/shared` + OpenAPI
- [ ] `Verify:` seeded fixtures return correct aggregates
- [ ] `Verify:` query < 200 ms on 100k rows locally

**Phase 4 complete: [ ]**

---

# Phase 5 - Abuse Prevention and Security

## Step 21 Rate Limiting

- [ ] Token bucket via `INCR`+`EXPIRE` in Redis (or `@fastify/rate-limit` with Redis store)
- [ ] `POST /api/links`: 20 links/hour per IP
- [ ] Key creation endpoint: stricter limit
- [ ] Per-API-key limit: 100/min (in bearer-auth middleware)
- [ ] `429` with `Retry-After` and `X-RateLimit-*` headers
- [ ] Keyed on real socket IP (trusted-proxy aware)
- [ ] `Verify:` burst of 25 creates → 20 succeed, 5 return 429
- [ ] `Verify:` header-order/rotation bypass attempts fail

## Step 22 Malicious URL Screening

- [ ] Safe Browsing API key provisioned and stored in env
- [ ] `threatMatches:find` check inside `POST /api/links`
- [ ] Match → 400 "URL flagged as unsafe"
- [ ] Match logged without URL content (hash where possible)
- [ ] `SAFE_BROWSING_FAIL_OPEN` flag with documented tradeoff
- [ ] Screening call rate-limited
- [ ] `Verify:` known-bad URL rejected (mock acceptable in tests)
- [ ] `Verify:` API-down path degrades per flag
- [ ] `Verify:` added p95 latency < 300 ms

## Step 23 API Keys for Programmatic Access

- [ ] `POST /api/keys` → `{ apiKey }` via `randomBytes(32)`
- [ ] `api_keys` table: SHA-256 hash + salt, raw key never stored
- [ ] Raw key returned exactly once
- [ ] Auth chain: bearer key → identify → per-key rate limit → allow
- [ ] `Verify:` created key creates links
- [ ] `Verify:` revoked/deleted key immediately rejected
- [ ] `Verify:` raw key absent from logs and DB

## Step 24 Duplicate-Link Detection

- [ ] `url_key` = SHA-256(normalized longUrl) stored on `links` (indexed)
- [ ] Reuse rule: same `url_key` + same session cookie (or API key) → return existing link
- [ ] Response flag `reused: true`
- [ ] No cross-user leakage (session/key scoped)
- [ ] Session cookie `sniprl_sid` (random, httpOnly, 30 days)
- [ ] `Verify:` duplicate create in one browser → one row, second marked `reused`
- [ ] `Verify:` different sessions → two rows

## Step 25 QR Code Generation

- [ ] `GET /api/links/:shortCode/qr` → 512px PNG (`qrcode`, error-correction M)
- [ ] Cache: Redis (7d TTL) or disk/CDN
- [ ] ETag for conditional requests
- [ ] `Verify:` QR decodes to the short URL (scanner-lib test)
- [ ] `Verify:` repeat request served from cache

**Phase 5 complete: [ ]**

---

# Phase 6 - Frontend

## Step 26 Application Shell and Routing

- [ ] Vite + React + TS + Tailwind configured
- [ ] Path aliases + `public` assets
- [ ] Routes: `/` (create), `/l/:shortCode` (public link page), `/m/:shortCode/:managementToken` (dashboard)
- [ ] Server rewrites to `index.html` (refresh/deep links work)
- [ ] Typed API client over `packages/shared` DTOs
- [ ] Error normalization (API 400s → field errors)
- [ ] `Verify:` deep link refresh works in dev and preview

## Step 27 Public Link-Creation Form

- [ ] Fields: long URL (required), custom alias, optional expiration + max clicks
- [ ] Client-side validation mirroring server Zod rules
- [ ] Inline field errors
- [ ] Success state: short URL + copy button
- [ ] Management token shown once with "copy/save" warning
- [ ] Manage-link entry point
- [ ] 429 handling (countdown message)
- [ ] 400 unsafe-URL message
- [ ] Session cookie set for duplicate detection
- [ ] `Verify:` full happy path end-to-end against local API
- [ ] `Verify:` token visible exactly once

## Step 28 Management Dashboard

- [ ] Token-authenticated analytics fetch
- [ ] KPI cards: total clicks, today, unique clicks, bot share
- [ ] Chart: clicks over time (line)
- [ ] Chart: top referrers (bar)
- [ ] Chart: top countries (bar)
- [ ] Chart: device breakdown (donut)
- [ ] Empty state, loading skeleton, error/retry states
- [ ] `Verify:` seeded fixtures render correct numbers
- [ ] `Verify:` creation-screen token unlocks dashboard

## Step 29 Management Actions UI

- [ ] Edit destination URL + expiration (PATCH) with shared validation
- [ ] "Pause/Expire now" action
- [ ] "Delete link" with double-confirm modal
- [ ] QR display + download (dashboard + public page)
- [ ] `Verify:` edit reflects immediately (cache invalidated; next redirect updated)
- [ ] `Verify:` delete → 404 on next visit

**Phase 6 complete: [ ]**

---

# Phase 7 - Quality Assurance

## Step 30 Unit Tests

- [ ] Base62 property tests
- [ ] UA parser fixture tests
- [ ] URL normalization tests
- [ ] Token generation tests (length, entropy, uniqueness)
- [ ] Rate-limit token bucket math tests
- [ ] Validation schema edge cases (protocol-less, unicode domains, 2049-char URLs)
- [ ] Coverage gate ≥ 90% on `packages/shared` and pure helpers
- [ ] `Verify:` `pnpm test` green; coverage gate enforced in CI

## Step 31 Integration Tests

- [ ] Harness: Fastify on ephemeral port, migrated temp schema, isolated Redis namespace
- [ ] Suite: create → redirect (302 + Location)
- [ ] Suite: token auth (401/404/200 paths)
- [ ] Suite: expiration by date (410)
- [ ] Suite: expiration by maxClicks (410)
- [ ] Suite: rate limiting (429)
- [ ] Suite: duplicate detection
- [ ] Suite: analytics enqueue → worker drain → aggregates correct
- [ ] Suite: API key create/use/revoke
- [ ] `Verify:` suite green in CI (ephemeral Postgres + Redis)
- [ ] `Verify:` no flakiness across 3 local reruns

## Step 32 End-to-End Tests (Playwright)

- [ ] Playwright installed + configured
- [ ] Scenario: create → copy → open in new context → 302
- [ ] Scenario: dashboard renders stats
- [ ] Scenario: delete flow
- [ ] Scenario: 429 handling
- [ ] CI job with auto-started web server
- [ ] `Verify:` 5 scenarios green in CI
- [ ] `Verify:` suite green against staging pre-launch

## Step 33 Load Testing (k6)

- [ ] `redirect.js`: ramp to saturation at 90% cache hit / 10% cold
- [ ] p50/p95/p99 captured per load level
- [ ] `create.js`: throughput under 20/hr rate limit (429s expected)
- [ ] Run against local stack (Postgres + Redis on `localhost`)
- [ ] Run against staging deployment
- [ ] HTML report produced
- [ ] `docs/load-testing.md`: methodology, graphs, first bottleneck, mitigation
- [ ] `Verify:` report states p99 at target RPS and names the first bottleneck

**Phase 7 complete: [ ]**

---

# Phase 8 - Observability and Operations

## Step 34 Structured Logging and Tracing

- [ ] Pino JSON logs in prod (pretty in dev)
- [ ] Request-id on every log line
- [ ] Log-level policy: info lifecycle, warn 4xx-abnormal, error 5xx
- [ ] 429 logging throttled (avoid log flood)
- [ ] Redaction: `authorization`, `managementToken`, `apiKey`, cookies
- [ ] Access logs reference short codes only (never destination URLs/query strings)
- [ ] `Verify:` every log line has request-id
- [ ] `Verify:` grep for token/API key in logs → no match

## Step 35 Uptime and Health Monitoring

- [ ] `/health` extended: DB ping, Redis ping, queue depth, worker last-heartbeat
- [ ] External monitor (UptimeRobot/Healthchecks) polling every 5 min
- [ ] Worker heartbeat staleness alert (10 min)
- [ ] Alert routing (Slack/email)
- [ ] `Verify:` stopping Postgres in staging triggers alert path
- [ ] `Verify:` heartbeat loss is detectable

## Step 36 Backups and Recovery

- [ ] Provider-managed daily backups enabled
- [ ] Restore drill performed once in staging
- [ ] `docs/runbook.md`: restore procedure
- [ ] `docs/runbook.md`: cache flush procedure + impact statement
- [ ] `docs/runbook.md`: DNS failover notes
- [ ] `docs/runbook.md`: rollback procedure
- [ ] `Verify:` restore drill documented with result

**Phase 8 complete: [ ]**

---

# Phase 9 - Compliance and Trust

## Step 37 Legal Documents

- [ ] Privacy Policy: data collected (hashed IPs, UA, referrer, geo)
- [ ] Privacy Policy: lawful basis, retention, erasure rights, contact
- [ ] Terms of Service: acceptable-use rules (no phishing/spam/malware)
- [ ] ToS: abuse takedown + liability limits
- [ ] Cookie notice + consent banner (no marketing cookies)
- [ ] Pages live at `/privacy` and `/terms`, linked from footer
- [ ] `Verify:` privacy text audited line-by-line against real data flow

## Step 38 Data Retention and Erasure

- [ ] Retention policy: 12 months raw, then aggregate + purge
- [ ] Aggregation job implemented (scheduled worker or `pg_cron`)
- [ ] Purge step implemented
- [ ] Erasure: `DELETE /api/links/:shortCode` purges that link's `click_events`
- [ ] Tradeoff of erasure vs. analytics archive documented
- [ ] Policy reflected in Privacy Policy
- [ ] `Verify:` purge deletes rows older than policy
- [ ] `Verify:` erasure path verified end-to-end in staging

## Step 39 Security Hardening Review

- [ ] HSTS header
- [ ] CSP header (`frame-ancestors none`)
- [ ] `X-Content-Type-Options` header
- [ ] `Referrer-Policy: strict-origin-when-cross-origin` (verified vs. referrer analytics)
- [ ] TLS enforced (HSTS + http→https redirect at CDN)
- [ ] CI redaction gate re-verified (secret-in-log fails CI)
- [ ] `pnpm audit` - zero high-severity findings
- [ ] Audit gate enabled in CI
- [ ] Hosting process: runs as non-root service user with least-privilege filesystem access; writeable scratch dir whitelisted
- [ ] `Verify:` security headers present on all responses

**Phase 9 complete: [ ]**

---

# Phase 10 - Deployment and Launch

## Step 40 Production Infrastructure Provisioning

- [ ] Managed Postgres provisioned (Supabase/Neon/RDS)
- [ ] Managed Redis provisioned (Upstash)
- [ ] API host provisioned (Railway/Render/Fly.io)
- [ ] Worker host provisioned
- [ ] Web host provisioned (Vercel)
- [ ] Domain purchased/configured
- [ ] DNS: A/AAAA → API host; CNAME → web host
- [ ] Cloudflare in front (proxied/orange-cloud)
- [ ] Production env vars set in platform secret managers
- [ ] Safe Browsing API key provisioned
- [ ] MaxMind license + GeoLite2 fetch into worker deploy bundle at deploy
- [ ] `Verify:` `curl https://<api>/health` → 200 from outside
- [ ] `Verify:` domain resolves; TLS valid

## Step 41 Deployment Pipeline (CD)

- [ ] Deploy workflow on merge to `main`: build → migrate → API → worker → web
- [ ] Migrations applied before code release
- [ ] Failed migration halts release
- [ ] Rollback path documented (previous image tag)
- [ ] Rollback drill succeeds in staging
- [ ] Semantic version tags on releases
- [ ] `Verify:` merge to `main` reaches production automatically

## Step 42 Pre-Launch Verification

- [ ] Full integration suite green against staging
- [ ] Full E2E suite green against staging
- [ ] Load report within target (redirect p99 < 100 ms at launch RPS)
- [ ] Safe Browsing rejection verified live
- [ ] Rate limits verified live
- [ ] 429 page verified visually
- [ ] Uptime monitor active and alerting
- [ ] SEO/meta basics (title, description, OG) - destination-URL OG decision documented
- [ ] Analytics smoke test live: create → click → dashboard shows click
- [ ] Launch checklist signed off; zero open P0 defects

## Step 43 Launch

- [ ] Final DNS switch / live domain verified (https on all pages)
- [ ] Launch communication sent
- [ ] First-48h watch active: dashboards, error rates, queue depth, screening budget
- [ ] Hotfix path verified (CI allows hotfix merges)
- [ ] First-week incident log maintained
- [ ] `Verify:` uptime ≥ 99.5% over first week (target)

## Step 44 Post-Launch Roadmap (P1/P2, do NOT build pre-launch)

> Each item ships only when its trigger fires. Record the trigger date here when it does.

- [ ] P1 Advanced analytics - trigger: creator request or ~50k clicks/day
  - [ ] Real-time click stream
  - [ ] UTM parameter breakdown
  - [ ] Click heatmap by hour of day
  - [ ] Behavioral bot filtering
  - [ ] CSV export / raw analytics API
- [ ] P1 Monthly partitioning of `click_events` - trigger: > a few million rows/partition
- [ ] P1 Redis-list → Kafka/SQS migration - trigger: measurable queue lag
- [ ] P2 Password-protected links (complete the Step 10 scaffold)
- [ ] P2 A/B redirect variants (cookie-consistent, per-variant metrics; consent banner live)
- [ ] P2 Consistent-hashing Redis sharding demonstration + write-up
- [ ] P2 Horizontal scaling + range-based ID allocation implementation

**Phase 10 complete: [ ]**

---

# Final Definition of Done (all must be checked at project end)

- [ ] All P0 features implemented, tested, and deployed to production
- [ ] CI gates green for every commit on `main`
- [ ] Redirect p99 < 100 ms at launch volume (measured, documented)
- [ ] Uptime ≥ 99.5% for first week post-launch
- [ ] Tokens/API keys never logged; IPs hashed; legal pages live
- [ ] Backups verified restorable; runbook committed; alerts firing
- [ ] Load-testing write-up + architecture docs in `docs/`

---

# Deferred Log

| Date | Item | Reason | Re-opened date |
| ---- | ---- | ------ | -------------- |
|      |      |        |                |
|      |      |        |                |
