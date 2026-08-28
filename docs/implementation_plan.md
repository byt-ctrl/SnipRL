# Implementation Plan - SnipRL

## 1. Tools I Use

| Part          | Tool                                        |
| ------------- | ------------------------------------------- |
| Backend       | Node.js + TypeScript + Fastify              |
| Database      | PostgreSQL                                  |
| Cache + queue | Redis                                       |
| Frontend      | React + Vite + Tailwind                     |
| Migrations    | Prisma                                      |
| CI/CD         | GitHub Actions                              |
| Tests         | Vitest + Playwright                         |
| Load test     | k6                                          |
| Hosting       | Railway/Render/Fly.io + Vercel + Cloudflare |

---

## 2. How I Work

- One branch per feature, merged with a pull request. CI must pass first.
- Every merge runs: lint, type check, tests, security check.
- Secrets (tokens, keys) never go in the repository. Only `.env.example` is committed.
- Passwords, tokens, and API keys are never written to logs.
- IP addresses are hashed before saving. Never stored raw.

---

## 3. The Steps

### Phase 0 - Setup

**1. Create the project**

- Do: Set up the repository, README, `.gitignore`, license.
- Done when: Clean repo, nothing generated is tracked.

**2. Set up the folder structure**

- Do: One repo with 3 parts - `apps/api` (backend), `apps/web` (frontend), `packages/shared` (shared code). Add linting, formatting, git hooks, and scripts (`dev`, `build`, `test`, `lint`).
- Done when: Both apps start with `pnpm dev`. Type check and lint pass.

**3. Local database and Redis**

- Do: Install PostgreSQL 16 and Redis 7 natively for the OS (Homebrew on macOS, apt/dnf on Linux, official installers on Windows). Create `.env.example` with `DATABASE_URL`, `REDIS_URL`, `PORT`, `APP_BASE_URL`, `PUBLIC_SITE_URL`.
- Done when: `pg_isready` succeeds against the local Postgres and `redis-cli ping` returns `PONG`. Both services start automatically on dev machine boot.

**4. CI pipeline**

- Do: GitHub Actions runs lint, type check, tests, and build on every push/PR.
- Done when: CI is green on a test branch.

### Phase 1 - Database and Short Codes

**5. Database tables**

- Do: Create `links` and `click_events` tables with Prisma. Indexes for fast lookups.
- Done when: Migration runs on a fresh database.

**6. Short code converter**

- Do: Write code that turns a number into a code (`1` → `1`, `62` → `10`, ...) and back.
- Done when: Round-trip tests pass (encode then decode = same number).

**7. Unique short codes**

- Do: After each link is saved, convert its ID to a short code and save it.
- Done when: Two links never share a code.

### Phase 2 - Core API

**8. App setup**

- Do: Fastify app with config validation, logging, error handling, and a `/health` check.
- Done when: App starts, `/health` returns 200, bad routes return a clean 404.

**9. Create link API**

- Do: `POST /api/links` saves a link and returns the short URL + management token.
- Done when: Creating a link works; a bad URL is rejected with a clear error.

**10. Redirect (the important one)**

- Do: `GET /:code` finds the link and redirects with a 302.
- Done when: Opening the code redirects to the right URL. Unknown code → 404. Expired link → 410.

**11. Manage links API**

- Do: With the management token, a user can view stats, edit, and delete their link.
- Done when: Wrong/missing token → 401. Correct token → everything works.

### Phase 3 - Caching

**12. Connect Redis**

- Do: Add a Redis client to the app.
- Done when: App reads/writes Redis. If Redis is down, the app still works (uses database).

**13. Cache redirects**

- Do: Check Redis first for a link, database only if missing. Update the cache when a link changes.
- Done when: Second visit to a link skips the database.

**14. Cache health check**

- Do: Track how often the cache is hit vs missed.
- Done when: I can see the hit rate in a dashboard/log.

### Phase 4 - Click Analytics

**15. Record clicks (without slowing redirects)**

- Do: When a redirect happens, push a click event to a Redis queue. Never wait for it.
- Done when: Redirects are just as fast with click tracking on.

**16. Background worker**

- Do: A separate worker takes events from the queue in batches and saves them to the database.
- Done when: Clicks land in the database. No duplicates, nothing lost on crash.

**17. Device and browser info**

- Do: Read the visitor's User-Agent and save device type, browser, and OS.
- Done when: Test browsers parse correctly.

**18. Bots and IP hashing**

- Do: Mark bots (Googlebot, etc.) in the data. Hash IPs before saving.
- Done when: Bots are flagged. Raw IPs never saved.

**19. Country and city**

- Do: Use the GeoLite2 file to get country/city from the IP.
- Done when: Test IPs give the right country.

**20. Analytics API**

- Do: `GET /api/links/:code/analytics` returns totals, daily clicks, top referrers, countries, devices.
- Done when: Numbers match test data.

### Phase 5 - Safety and Security

**21. Rate limits**

- Do: Max 20 links per hour per IP. Limits for API keys too.
- Done when: A burst of 25 creations → 20 succeed, 5 get 429.

**22. Block bad links**

- Do: Check new URLs with Google Safe Browsing before saving.
- Done when: A known bad URL is rejected.

**23. API keys**

- Do: Users can create an API key. Only the key's hash is stored.
- Done when: Key works, deleted key stops working, raw key never stored.

**24. Duplicate links**

- Do: Same URL + same browser → return the existing link instead of a new one.
- Done when: Shortening the same URL twice gives one link.

**25. QR codes**

- Do: An endpoint that returns a QR image for a link. Cache it.
- Done when: QR scans to the correct URL. Second request is served from cache.

### Phase 6 - Website (Frontend)

**26. App shell**

- Do: React app with 3 pages: create link, link page (QR), management dashboard.
- Done when: Pages open and route correctly, refresh works.

**27. Create link form**

- Do: A form for the long URL, optional custom alias, optional expiration. Shows the short link + token once.
- Done when: A real user can create a link in the browser.

**28. Dashboard**

- Do: Charts for total clicks, clicks per day, top referrers, countries, devices.
- Done when: Charts show correct numbers for test data.

**29. Manage actions**

- Do: Edit destination, pause/delete link, download QR.
- Done when: Editing updates the redirect. Deleting makes the link return 404.

### Phase 7 - Testing

**30. Unit tests**

- Do: Test the small pure parts (short codes, validation, token generation).
- Done when: All pass. 90%+ coverage on shared code.

**31. API tests**

- Do: Test all API flows against a real database and Redis: create, redirect, 404, 410, 429, tokens, analytics.
- Done when: All pass in CI.

**32. Browser tests**

- Do: Playwright tests for the main user journey: create → open → 302 → dashboard.
- Done when: 5 scenarios pass in CI.

**33. Load test**

- Do: Use k6 to find how many redirects per second the app can handle, and the p99 latency. Write up the results.
- Done when: I know the limit and the first bottleneck.

### Phase 8 - Monitoring and Backups

**34. Logging**

- Do: Logs with request IDs. Never log tokens, keys, or full URLs.
- Done when: Searching logs for a token finds nothing.

**35. Health checks**

- Do: `/health` checks database, Redis, queue. Alerts if something is down.
- Done when: Stopping the database triggers an alert.

**36. Backups**

- Do: Daily database backups. Write a runbook (how to restore, flush cache, rollback).
- Done when: Restore was tested once in staging.

### Phase 9 - Legal and Security

**37. Privacy and terms**

- Do: Write Privacy Policy and Terms of Service. Publish on the site.
- Done when: Both pages are live and linked from the footer.

**38. Data retention**

- Do: Keep click data 12 months, then summarize and delete. Deleting a link removes its clicks.
- Done when: Old data gets purged automatically.

**39. Security review**

- Do: Add security headers, force HTTPS, scan dependencies, run app as non-root.
- Done when: Security scan clean, headers present everywhere.

### Phase 10 - Launch

**40. Production setup**

- Do: Create the production database, Redis, hosting, domain, DNS, Cloudflare. Add all secrets.
- Done when: `/health` works from the internet.

**41. Auto-deploy**

- Do: Merging to `main` builds and deploys: migrate database → deploy backend → deploy worker → deploy website.
- Done when: A merge reaches production automatically.

**42. Final check**

- Do: Run all tests against staging. Check limits, blocking, alerts, and one full user journey.
- Done when: Launch checklist all checked, no open bugs.

**43. Launch**

- Do: Go live. Watch dashboards and errors for 48 hours.
- Done when: Site works for real users, uptime ≥ 99.5% in the first week.

**44. After launch (build only when needed)**

- Do: Advanced analytics, password-protected links, A/B testing, custom domains.
- Done when: A real user requests it - then build it in order.

---

## 4. Order of Work (Simple)

Everything goes top to bottom. One phase must be fully done before the next starts.

```
Setup (1-4) → Database (5-7) → API (8-11) → Cache (12-14)
    → Analytics (15-20) → Safety (21-25) → Website (26-29)
    → Testing (30-33) → Monitoring (34-36) → Legal (37-39)
    → Launch (40-43) → After (44)
```

Three things can be done in parallel:

- Unit tests (30) can run alongside anything.
- Load testing (33) can start after step 10.
- Privacy documents (37) can be written any time.

---

## 5. What "Done" Means (Project Level)

- All must-have features work in production.
- Tests pass on every merge.
- Redirects under 100 ms (p99) under expected load.
- Uptime 99.5%+ in the first week.
- No tokens or keys in logs. IPs hashed. Privacy pages live.
- Backups tested, alerts working.

---

## 6. Time Estimate

| Phase               | Time                                |
| ------------------- | ----------------------------------- |
| 0. Setup            | 1–2 days                            |
| 1. Database + codes | 1 day                               |
| 2. Core API         | 1.5–2 days                          |
| 3. Cache            | 1 day                               |
| 4. Analytics        | 2–3 days                            |
| 5. Safety           | 2 days                              |
| 6. Website          | 2–3 days                            |
| 7. Testing          | 2 days                              |
| 8. Monitoring       | 1 day                               |
| 9. Legal            | 1 day                               |
| 10. Launch          | 1–2 days                            |
| **Total**           | **About 2–3 weeks of focused work** |
