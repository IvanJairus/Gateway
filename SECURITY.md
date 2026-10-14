# Security policy

This repository is the gateway for one domain. It is a static landing page and a
path-based reverse proxy: every page it serves is generated from `registry/apps.json`
by `scripts/build.mjs`, and requests under a registered app path are rewritten to
that app's own host. There is no backend, no database, no accounts, no forms and no
cookie, so the gateway itself stores nothing about a visitor and cannot leak what it
does not hold.

Two things follow from that shape, and they are the reason this file exists:

- The gateway's own surface is its headers and its rewrite table. Both are generated,
  so a bug in the generator is a security bug, not a cosmetic one.
- Traffic to `/portfolio/` and `/games/` is served by other projects. Their headers,
  their scripts and their data are theirs. A finding against those belongs to the
  repository that builds them, not here.

## What this gateway enforces

`registry/vercel.base.json` is the single source for the header set, and CI asserts
that it contains a CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy` and a
`Permissions-Policy`. The generated policy on every gateway path is:

```
default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self';
connect-src 'self' https://vitals.vercel-insights.com; base-uri 'none';
form-action 'none'; frame-ancestors 'none'
```

plus `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy:
same-origin`, `X-Content-Type-Options: nosniff` and
`Strict-Transport-Security: max-age=63072000; includeSubDomains`.

`script-src 'self'` rather than `'none'` because the host injects its own same-origin
analytics and speed-insights scripts under `/_vercel/`. Those are the only third-party
requests the page makes, and `vitals.vercel-insights.com` is the only external host the
policy admits.

App paths are deliberately excluded from this header rule. Two Content-Security-Policy
headers on one response intersect, and the strictest wins, which would break an app
without any visible error. The app keeps its own policy on its own path.

`scripts/lib/validate.mjs` is the reason this cannot become an open proxy: every app
origin in the registry has to match one pinned host pattern, every slug has to match a
character class, reserved paths and cross-app path collisions are rejected, and a
registry that fails validation produces no build at all.

## What counts as a vulnerability

- A way to execute script on a gateway page: a CSP bypass, an unescaped interpolation
  in `scripts/lib/render.mjs`, or a registry value that reaches markup without going
  through `esc()`.
- A rewrite or redirect that reaches a host outside the pattern the validator enforces,
  or that lets a path escape the app it was registered for.
- A header set that is weaker in the delivered response than the configuration claims,
  including a rule in the generated `vercel.json` that silently stops matching a path.
- A published file that should not be public: a credential, a token, an internal
  hostname, or employer data. Everything in this repository is intended to be public.
- A CI supply-chain problem: a workflow step running a floating tag, an action pinned
  to a SHA that is not the commit that tag names, `pull_request_target` or
  `workflow_run` executing unreviewed pull-request code, an over-broad `permissions:`
  block, or a build tool fetched unpinned at run time.

## What is out of scope

- Anything that needs the gateway to do something it does not do: authentication
  bypass, rate limiting, injection into a database, XML external entities.
- The security posture of the apps behind the rewrites, and findings that are only
  reachable on an app's own hostname.
- Vulnerabilities in the Vercel platform or in GitHub Actions runners. Those go to the
  vendor. Note the two measured platform behaviours below, so a scan does not report
  them as a bug here.
- Dependency advisories in general. There are no installed runtime dependencies; what
  CI fetches at run time is listed above as in scope.

## Two measured limits, stated before anyone finds them

1. Paths under `/.well-known/` are served without any of the configured response
   headers, including the CSP. Measured 2026-10-14: every other path on this domain
   returns the full header set, while `/.well-known/security.txt` returns none of it,
   and a path that does not exist under `/.well-known/` behaves the same. Other dotted
   paths are covered, so the exception is that one prefix at the host level. The
   consequence is small (a plain-text file with no script), but the CI check reads the
   configuration file rather than a live response, so it cannot see this on its own.
2. A path segment of `..` through a rewrite, such as `/games/../`, returns a 502 with
   `ROUTER_FILESYSTEM_LOOKUP_ERROR` instead of a 404. The same request against the
   app's own hostname returns the same error, so it is the host's router refusing the
   path, not this repository forwarding it. No other origin becomes reachable, because
   the rewrite destination is built from a registry value the validator pins.

## How to report

Email **Filemonivanjairus@gmail.com**. That address is already published in
`.well-known/security.txt` on this domain, so plaintext is acceptable. If the finding
is sensitive, send an outline first and ask for an encryption method before describing
it.

Please include the URL, what happens instead of what should happen, the steps to
reproduce, and the impact. A proof of concept is worth more than a paragraph. Do not
open a public issue for an unfixed vulnerability: this repository is public, and an
issue is a disclosure.

There is no bug bounty, and no safe-harbour promise beyond this one: a good-faith report
sent to the address above will not be reported, and the reporter's identity will not be
disclosed.

## Response commitment

No SLA. This is one engineer's own time, and a number nobody can keep is worse than no
number. I read every report, and a confirmed finding is fixed in a commit that says what
it was. If you need coordination before you disclose, say so in the first message and I
will hold to your timeline.
