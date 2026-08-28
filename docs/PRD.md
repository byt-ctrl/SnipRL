# PRD - SnipRL: URL Shortener with Analytics

## 1. What I'm Building

A website where anyone can paste a long URL and get a short link like `sniprl.app/x7K2mQ`.
The link redirects visitors to the original URL, and the creator can see who clicked and how.

## 2. Why

Existing tools (Bitly, TinyURL, Rebrandly) are expensive or hide useful analytics behind paywalls.
I offer a fast, free, simple alternative.

## 3. Goals

1. Create short links in seconds, no signup needed.
2. Show real analytics: clicks, dates, devices, countries, referrers.
3. Fast redirects (under 100 ms) and reliable uptime (99.5%+).
4. Built so it can grow later without a rewrite.

## 4. Who Uses It

| User                       | What they need                                         |
| -------------------------- | ------------------------------------------------------ |
| Individuals                | Free short links for social media, resumes, portfolios |
| Marketers / small business | Custom short links + click stats                       |
| Developers                 | API to create and manage links programmatically        |

## 5. What I Build (Features)

### 5.1 Must have (P0) - needed to launch

- **Create a short link.** Every link gets a 7-character code (letters + numbers).
- **Custom alias.** Users can pick their own text, e.g. `sniprl.app/my-link` (3–30 letters, numbers, hyphens; can't use reserved words like `admin` or `api`).
- **Redirect.** Opening a short link sends the visitor to the original URL with a 302 redirect.
- **Analytics.** For every click I store: time, device (mobile/desktop/tablet), browser, OS, country, city, and referrer.
- **Analytics dashboard.** Charts showing total clicks, clicks per day, top referrers, top countries, devices.
- **Management token.** When a link is created, the user gets a secret token. Only someone with the token can edit, delete, or see analytics for that link. No accounts needed.
- **Link expiration (optional).** A link can stop working after a date or after a max number of clicks.
- **Rate limiting.** Max 20 links per hour per person, to stop spam.
- **Safe Browsing check.** Bad links (phishing, malware) are rejected when created.
- **API keys.** Developers can get a key to use the API.
- **QR code.** Every short link can show/download a QR code.
- **Duplicate detection.** If you shorten the same URL twice in one browser, I reuse the first link.

### 5.2 Build later (P1/P2) - only when needed

- Password-protected links (require a password to open)
- A/B testing (one link, two destinations, split traffic)
- Advanced analytics (real-time, UTM, CSV export)
- Custom domains (yourbrand.co/xyz)
- Accounts

## 6. How It Works (Simple Version)

1. User creates a link → I save it in a database and give back the short code + token.
2. Visitor opens the short link → the app looks it up and redirects with a 302.
3. The app saves the click to a queue (doesn't wait for it) → a background worker saves it to the database.
4. The dashboard reads the database and shows charts.

**Important rules:**

- Redirects must be fast. I use a cache (Redis) so popular links don't hit the database every time.
- Clicks are saved after the redirect is sent, never before - visitors never wait for analytics.
- I use 302, not 301. A 301 lets browsers remember the redirect and stop counting clicks.
- The runtime is a plain Node.js process. The API and the worker ship as independent processes on managed hosts; no container runtime is required in dev or production.

## 7. Privacy

- IP addresses are hashed (scrambled) before saving - I never store raw IPs.
- I publish a Privacy Policy and Terms of Service.
- Click data is kept 12 months, then summarized and deleted.
- Management tokens are long random secrets, sent only over HTTPS, never logged.

## 8. Tech Stack

| Part                        | I use                                                                                        |
| --------------------------- | -------------------------------------------------------------------------------------------- |
| Backend                     | Node.js + TypeScript + Fastify                                                               |
| Database                    | PostgreSQL (managed)                                                                         |
| Cache / queue / rate limits | Redis (managed)                                                                              |
| Frontend                    | React + Vite + Tailwind                                                                      |
| Charts                      | Recharts                                                                                     |
| Geo-IP                      | MaxMind GeoLite2 (free, self-hosted)                                                         |
| Hosting                     | Railway/Render/Fly.io + Vercel + Cloudflare                                                  |
| Local dev services          | Native PostgreSQL 16 + Redis 7 on the host (Homebrew / apt / dnf / Windows installer / WSL2) |
| Deployment model            | Build-on-CI → deploy-artifact → host runs the Node process as a non-root service user        |
| Load testing                | k6                                                                                           |

## 9. Build Plan (11 Days)

| Day | What                                                               |
| --- | ------------------------------------------------------------------ |
| 1   | Native local Postgres + Redis + database tables + short code logic |
| 2   | Create link API + redirect (302)                                   |
| 3   | Redis cache for redirects                                          |
| 4   | Rate limits + Safe Browsing check                                  |
| 5–6 | Click tracking: queue + background worker                          |
| 7   | Analytics dashboard                                                |
| 8   | Custom aliases + QR codes                                          |
| 9   | API keys + duplicate detection                                     |
| 10  | Privacy policy, terms, security review                             |
| 11  | Testing, fixes, deploy, launch                                     |

## 10. Success (First 90 Days)

| Metric                     | Target       |
| -------------------------- | ------------ |
| Redirect speed (p99)       | Under 100 ms |
| Uptime                     | 99.5%+       |
| Links created              | 5,000+       |
| Weekly active creators     | 200+         |
| Bot clicks wrongly counted | Under 5%     |

## 11. Open Questions

- Should users be able to use their own domain? (Nice feature, extra work.)
- Pricing later? (Maybe usage-based.)
- Add optional accounts later so users see all their links in one place?
