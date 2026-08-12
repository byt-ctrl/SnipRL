# SnipRL: High-Performance URL Shortener with Analytics

SnipRL is an enterprise-grade, privacy-focused URL shortening platform engineered for ultra-low latency redirects (sub-100ms p99 target), real-time click analytics, and programmatic API access. It operates without requiring user accounts by using cryptographically secure management tokens for link ownership and administration.

---

## Overview & Architecture Highlights

- **Low-Latency Redirects**: Sub-100ms response times achieved via Redis cache-aside architecture serving hot-path 302 redirects.
- **Real-Time Click Analytics**: Captures click events asynchronously via a Redis queue to avoid blocking redirect responses. Tracks timestamp series, user agent metadata (device type, browser, OS), geographic location via self-hosted MaxMind GeoLite2, referrers, and bot vs. human traffic split.
- **Privacy-First Design**: IP addresses are SHA-256 hashed with per-deployment cryptographic salts prior to persistence. Raw IP addresses are never logged or stored.
- **Token-Based Management**: Link creation generates a unique secret management token for authorization to view analytics, update destination URLs, or soft-delete links.
- **Abuse Prevention**: Built-in Google Safe Browsing integration for malicious link screening, sliding token-bucket rate limiting (20 creations/hr/IP), and custom alias validation.
- **Developer Integration**: Support for programmatic API keys and dynamic QR code generation.

---

## Technology Stack

| Component              | Technology                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------- |
| Package Manager        | pnpm workspaces                                                                       |
| Backend Server         | Node.js, Fastify, TypeScript                                                          |
| Database & ORM         | PostgreSQL 16, Prisma ORM                                                             |
| Cache & Message Queue  | Redis 7, ioredis                                                                      |
| Frontend Web App       | React 18, Vite, TypeScript, Tailwind CSS                                              |
| Analytics & Processing | Asynchronous Redis List Queue, Worker Service, `@maxmind/geoip2-node`, `ua-parser-js` |
| Testing Suite          | Vitest (Unit/Integration), Playwright (E2E), k6 (Performance/Load)                    |
| Code Standards         | ESLint, Prettier, Husky, lint-staged, Commitlint                                      |

---

## Monorepo Directory Architecture

```text
SnipRL/
├── apps/
│   ├── api/                # Fastify HTTP API & Background Worker Process
│   └── web/                # React + Vite Web Dashboard Application
├── packages/
│   └── shared/             # Shared TypeScript Types, Zod Schemas, & Base62 Utilities
├── docs/
│   ├── PRD.md              # Product Requirements Document
│   ├── execution_checklist.md # 44-Step Project Execution Checklist
│   └── implementation_plan.md  # Architectural Implementation Plan
├── .gitignore              # Source control exclusion file
├── LICENSE                 # Software License Agreement (MIT)
└── README.md               # Project documentation
```

---

## System Documentation

Comprehensive architecture, requirements, and execution details are maintained in the [`docs/`](docs/) directory:

- [Product Requirements Document (PRD)](docs/PRD.md): Product specification, feature breakdown, privacy rules, and success metrics.
- [Execution Checklist](docs/execution_checklist.md): 44-step implementation checklist tracking project progress across 11 phases.
- [Implementation Plan](docs/implementation_plan.md): Technical architecture guide, data workflow, phase breakdown, and execution principles.

---

## Local Development Setup

### Prerequisites

- Node.js (v20.0.0 or higher)
- pnpm (v9.0.0 or higher)
- Docker Desktop or Docker Engine (for PostgreSQL 16 and Redis 7 service containers)

### Installation & Execution Steps

1. **Clone the repository**:

   ```bash
   git clone <repository-url>
   cd SnipRL
   ```

2. **Install dependencies**:

   ```bash
   pnpm install
   ```

3. **Spin up local infrastructure services**:

   ```bash
   docker compose up -d
   ```

4. **Configure Environment Variables**:
   Copy `.env.example` configurations into local environment files:

   ```bash
   cp apps/api/.env.example apps/api/.env
   cp apps/web/.env.example apps/web/.env
   ```

5. **Execute database migrations**:

   ```bash
   pnpm db:migrate
   ```

6. **Start development applications**:
   ```bash
   pnpm dev
   ```

### Workspace Commands

| Command           | Action                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------ |
| `pnpm dev`        | Starts development servers for both `apps/api` (Fastify) and `apps/web` (Vite) concurrently      |
| `pnpm build`      | Compiles TypeScript declarations in `packages/shared`, builds `apps/api`, and bundles `apps/web` |
| `pnpm typecheck`  | Runs TypeScript static type checking across all workspace packages (`noEmit`)                    |
| `pnpm lint`       | Runs ESLint across the monorepo                                                                  |
| `pnpm format`     | Formats codebase using Prettier                                                                  |
| `pnpm db:migrate` | Runs database migrations for `apps/api`                                                          |

---

## Environment Configuration Matrix

| Variable                | Description                       | Local Development                                  | Staging                          | Production                    |
| ----------------------- | --------------------------------- | -------------------------------------------------- | -------------------------------- | ----------------------------- |
| `DATABASE_URL`          | PostgreSQL connection URI         | `postgresql://sniprl:sniprl@localhost:5432/sniprl` | Managed DB Cluster               | Managed DB Cluster            |
| `REDIS_URL`             | Redis connection URI              | `redis://localhost:6379`                           | Managed Redis Instance           | Managed Redis Instance        |
| `PORT`                  | API Service HTTP Port             | `3000`                                             | Environment variable             | Environment variable          |
| `APP_BASE_URL`          | Short URL domain base             | `http://localhost:3000`                            | `https://staging-snip.rl`        | `https://sniprl.app`          |
| `PUBLIC_SITE_URL`       | Web interface base URL            | `http://localhost:5173`                            | `https://staging-web.sniprl.app` | `https://sniprl.app`          |
| `SAFE_BROWSING_API_KEY` | Google Safe Browsing API Key      | `mock` / dev key                                   | Staging Key                      | Production Key                |
| `GEOIP_DB_PATH`         | Path to GeoLite2-City database    | `./geo/GeoLite2-City.mmdb`                         | `/app/geo/GeoLite2-City.mmdb`    | `/app/geo/GeoLite2-City.mmdb` |
| `IP_SALT`               | Cryptographic salt for IP hashing | `dev-salt-12345`                                   | Secret Manager                   | Secret Manager                |

---

## Repository & Development Standards

### Branch Protection Policies

- Direct pushes to the `main` branch are restricted.
- All code changes must be submitted through Pull Requests originating from topic branches (e.g., `feat/base62-encoder`, `fix/cache-invalidation`).
- Pull Requests require passing status checks from automated CI pipelines (linting, static type analysis, and test suites) before merging.

### Conventional Commits Format

Commit messages must conform to the Conventional Commits specification:

```text
<type>(<scope>): <short summary>

[optional body]

[optional footer]
```

#### Allowed Types:

- `feat`: Implementation of a new feature
- `fix`: Resolution of a bug or defect
- `docs`: Additions or updates to documentation
- `style`: Formatting or lint fixes without logic changes
- `refactor`: Structural code changes without functional alterings
- `perf`: Code changes focused on performance optimization
- `test`: Addition or modification of unit/integration test cases
- `chore`: Operational maintenance, dependency, or build pipeline updates

#### Examples:

- `feat(api): add base62 short code generation module`
- `fix(redirect): return HTTP 410 Gone for expired links`
- `docs(readme): update environment configuration matrix`
- `chore(deps): upgrade fastify core framework to latest version`

---

## License

This software is released under the terms of the [MIT License](LICENSE).
