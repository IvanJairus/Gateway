# Cutover Log: Gateway Core & Portfolio Mount

Recorded at: 2026-10-13 21:36 WIB (14:36 UTC)
Domain: `https://www.ivanjairus.xyz` (Apex: `https://ivanjairus.xyz`)
Platform: Vercel (Edge Network, Singapore `sin1`)

---

## 1. Executive Summary

- **Gateway project (`ij-gateway`)**: Created on Vercel from `IvanJairus/Gateway@main`, framework preset Other, root directory output, Deployment Protection disabled, Web Analytics and Speed Insights active.
- **Portfolio project (`ij-portfolio`)**: Renamed from `portofolio`, origin domain assigned as `ij-portofolio.vercel.app` (due to third-party namespace collision on `ij-portfolio.vercel.app`), Deployment Protection disabled.
- **Branch `gateway-adapt` (PR #12)**: Merged into `IvanJairus/Portofolio@main` (`853266d`), routing `/portfolio/` and subpaths (`/portfolio/decisions/`, etc.) with canonical and OG metadata.
- **Domain Cutover**: `www.ivanjairus.xyz` and `ivanjairus.xyz` detached from `ij-portfolio` and attached to `ij-gateway` (apex redirecting 308 to `www`). DNS unchanged.
- **Automation Probe**: GitHub repository variable `GATEWAY_LIVE=true` provisioned on `IvanJairus/Gateway`.

---

## 2. Verification Matrix (Measured via `curl -sI`)

### 2.1 Core Routes

| Route | Expected Status | Measured Status | Notes |
|---|---|---|---|
| `https://ivanjairus.xyz/` | 308 | **308** | `Location: https://www.ivanjairus.xyz/` |
| `https://www.ivanjairus.xyz/` | 200 | **200** | Served by `ij-gateway` (Landing page) |
| `https://www.ivanjairus.xyz/portfolio/` | 200 | **200** | Proxied to `ij-portofolio` (`sin1:sin1:sin1`) |
| `https://www.ivanjairus.xyz/portfolio/decisions/` | 200 | **200** | Proxied to `ij-portofolio` (`sin1:sin1:sin1`) |
| `https://www.ivanjairus.xyz/portfolio/reports/` | 200 | **200** | Proxied to `ij-portofolio` (`sin1:sin1:sin1`) |
| `https://www.ivanjairus.xyz/portfolio/pipelines/` | 200 | **200** | Proxied to `ij-portofolio` (`sin1:sin1:sin1`) |
| `https://www.ivanjairus.xyz/portfolio/diagrams/` | 200 | **200** | Proxied to `ij-portofolio` (`sin1:sin1:sin1`) |
| `https://www.ivanjairus.xyz/portfolio/assets/css/base.css` | 200 | **200** | Static asset proxied cleanly |

### 2.2 Legacy Redirects & Hop Count (Max 2 Hops Budget)

| Initial URL | Hop 1 | Hop 2 | Final Status | Hop Count |
|---|---|---|---|---|
| `https://www.ivanjairus.xyz/decisions/` | 308 -> `/portfolio/decisions/` | - | 200 | **1 hop** |
| `https://www.ivanjairus.xyz/decisions` | 308 -> `/decisions/` | 308 -> `/portfolio/decisions/` | 200 | **2 hops** |
| `https://www.ivanjairus.xyz/reports/` | 308 -> `/portfolio/reports/` | - | 200 | **1 hop** |
| `https://www.ivanjairus.xyz/reports` | 308 -> `/reports/` | 308 -> `/portfolio/reports/` | 200 | **2 hops** |
| `https://www.ivanjairus.xyz/pipelines/` | 308 -> `/portfolio/pipelines/` | - | 200 | **1 hop** |
| `https://www.ivanjairus.xyz/pipelines` | 308 -> `/pipelines/` | 308 -> `/portfolio/pipelines/` | 200 | **2 hops** |
| `https://www.ivanjairus.xyz/diagrams/` | 308 -> `/portfolio/diagrams/` | - | 200 | **1 hop** |
| `https://www.ivanjairus.xyz/diagrams` | 308 -> `/diagrams/` | 308 -> `/portfolio/diagrams/` | 200 | **2 hops** |
| `https://www.ivanjairus.xyz/assets/css/base.css` | 308 -> `/portfolio/assets/css/base.css` | - | 200 | **1 hop** |

### 2.3 Sitemaps

| Endpoint | Content-Type | Status | Details |
|---|---|---|---|
| `https://www.ivanjairus.xyz/sitemap.xml` | `application/xml` | **200** | Sitemap index linking gateway & portfolio sitemaps |
| `https://www.ivanjairus.xyz/sitemap-gateway.xml` | `application/xml` | **200** | Gateway root + categories |
| `https://www.ivanjairus.xyz/portfolio/sitemap.xml` | `application/xml` | **200** | All 5 portfolio pages prefixed with `/portfolio/` |

---

## 3. Security & Header Inspections

1. **CSP Scoping (No Double CSP)**:
   Requesting `https://www.ivanjairus.xyz/portfolio/` returns exactly one `content-security-policy` header (belonging to the portfolio). Gateway negative lookahead (`/((?!portfolio(?:/|$)).*)`) successfully avoids colliding CSP headers.

2. **No Origin Leakage (`*.vercel.app`)**:
   All `Location` headers in redirect chains use relative paths (`/portfolio/...`) or apex-to-www canonical redirects (`https://www.ivanjairus.xyz/`). No `*.vercel.app` hostnames leak to the client.

3. **HSTS & Hardening**:
   - `Strict-Transport-Security: max-age=63072000; includeSubDomains` present.
   - `X-Content-Type-Options: nosniff` present.
   - `Cross-Origin-Opener-Policy: same-origin` present.
   - `Cross-Origin-Resource-Policy: same-origin` present.
   - `Referrer-Policy: strict-origin-when-cross-origin` present.

---

## 4. Operational Adjustments & Lessons Learned

1. **Origin Subdomain Collision**:
   The identifier `ij-portfolio.vercel.app` was already registered by an external third-party project on Vercel. Resolved cleanly by using `ij-portofolio.vercel.app` (matching the repository name `Portofolio`), satisfying the schema regex `^https://ij-[a-z0-9-]+\.vercel\.app$` and fully automated across registry and vercel rewrites.

2. **Trailing Slash in Reverse Proxying**:
   Vercel's Edge Router treats directory paths and wildcard patterns (`:path*`) differently when `trailingSlash: true` is active.
   - In `ij-gateway`: Slashed subpaths (`:path*/`) are explicitly rewritten alongside standard subpaths (`:path*`) to guarantee trailing slashes are forwarded upstream rather than stripped.
   - In `ij-portfolio`: `trailingSlash` was removed from the backend origin per Plan v3 §6 mitigation, preventing intermediate 308 loops while Gateway enforces edge canonical trailing slashes.
