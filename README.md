# ij-gateway

The entry point for `ivanjairus.xyz`. It owns the root path and proxies each app
to the project that serves it, so every app lives under one domain at
`/<slug>/` without any of them knowing they are proxied.

| Path | Served by |
|---|---|
| `/`, `/categories/<id>/`, `/static/` | this repository |
| `/portfolio/` | `ij-portfolio` Vercel project |
| `/games/` | `ij-games` Vercel project |

There is no framework, no build step on the host, and no runtime dependency. The
pages you are about to read are generated here and committed.

## Adding an app

1. Build the app so it serves itself under `/<slug>/` on its own origin. A Vite
   app does it with `base: '/<slug>/'` and `outDir: 'dist/<slug>'`; a static site
   does it with an internal rewrite in its own `vercel.json`.
2. Create the Vercel project as `ij-<slug>`, turn Deployment Protection off, and
   confirm `curl -sI https://ij-<slug>.vercel.app/<slug>/` returns 200. Protection
   must be off because the rewrite arrives from the gateway and Standard
   Protection would answer 401.
3. Add one object to `registry/apps.json`, plus one icon at
   `static/img/apps/<card id>.svg`. A new category needs no setup: it is just a
   value of `cards[].category`.
4. Run `node scripts/build.mjs`, commit every file it rewrote, push. CI runs the
   same command with `--check` and fails if the committed output is stale.
5. Open `https://www.ivanjairus.xyz/<slug>/` and find the card on the landing.

## How the pieces fit

`registry/apps.json` is the only place an app or a card is named. `scripts/lib/`
derives the routing and the categories from it, `scripts/lib/validate.mjs` rejects
a registry that cannot be built safely, and `scripts/build.mjs` writes
`index.html`, `404.html`, `categories/<id>/index.html`, `sitemap.xml`,
`sitemap-gateway.xml`, `robots.txt` and `vercel.json`.

`registry/vercel.base.json` holds the hand-written part of the Vercel config:
`trailingSlash`, the header list, and the CSP string. A header rule with an empty
`source` is scoped by the generator to every path that is not an app path:

```
/((?!portfolio(?:/|$)|games(?:/|$)).*)
```

That scoping is not cosmetic. Two `Content-Security-Policy` headers intersect and
the strictest directive wins, so a gateway CSP applied over `/portfolio/` would
silently break a policy the portfolio tuned on its own.

### Status

| `status` | rewrite | card | sitemap |
|---|---|---|---|
| `live` | yes | yes | yes, if `sitemap: true` |
| `hidden` | yes | no | no |
| `draft` | no | yes, marked as not built | no |

`draft` renders a card on purpose. An app that is announced but not built should
say so, and the tile carries a dashed border, no open arrow, and the words
`draft · not built yet`. A tile that lies about existing is worse than no tile.

### Landing layout

Tiles come from the registry in category order, then card order. The grid is one
row of at most three, and the last row divides the leftover width, so two cards
left over means two half-width cards. The category is a corner tag rather than a
section heading, because with two apps a section would give one heading to one
card.

## Checks

```
node --test tests/*.test.mjs     # registry rules and generator output
node scripts/build.mjs --check   # committed files match the registry
npx --yes html-validate@8 index.html 404.html categories/*/index.html
```

`.github/workflows/ci.yml` runs all three, plus a guard that fails if a
`vercel.app` host appears anywhere outside `registry/` and `vercel.json`.

The scheduled job that probes every live app stays off until the domain points at
this project. Set the repository variable `GATEWAY_LIVE` to `true` after the
cutover to turn it on.

## Vercel

Project name `ij-gateway`, repository `IvanJairus/Gateway`. Framework preset
Other, no build command, output directory is the repository root. Web Analytics
and Speed Insights are enabled here and only here: the portfolio's own script
requests `/_vercel/...` as an absolute path, so those requests are served by this
project and its metrics land on this dashboard, filterable by path.

`trailingSlash: true` is set here, so a source without a trailing slash is
redirected. Legacy redirects are generated in both variants for that reason:
`/decisions` and `/decisions/` each land on `/portfolio/decisions/` in one hop.
