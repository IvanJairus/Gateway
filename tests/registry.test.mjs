import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { derive, redirectPlan, RESERVED } from "../scripts/lib/registry.mjs";
import { validate } from "../scripts/lib/validate.mjs";
import { renderVercel, renderLanding, renderCategoryPage, renderSitemapGateway } from "../scripts/lib/render.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ICON = "/static/img/apps/portfolio.svg";
const OFF_SITE = "https://splitbill.ivanjairus.xyz/";

function app(over = {}) {
  return {
    slug: "portfolio",
    origin: "https://ij-portfolio.vercel.app",
    framework: "static",
    status: "live",
    sitemap: true,
    cards: [{ id: "portfolio", path: "", title: "Portfolio", summary: "s", category: "portfolio", icon: ICON, order: 10 }],
    ...over,
  };
}
function registry(apps, meta = { portfolio: { title: "Portfolio", order: 10 } }) {
  return { site: { origin: "https://www.ivanjairus.xyz", title: "T" }, categoryMeta: meta, apps };
}
function externalApp(over = {}) {
  return app({
    slug: "splitbill",
    origin: undefined,
    external: OFF_SITE,
    sitemap: false,
    cards: [{ id: "splitbill", path: "", title: "Split Bill", summary: "s", category: "apps", icon: ICON, order: 10 }],
    ...over,
  });
}
const offSite = (over) => registry([externalApp(over)], { apps: { title: "Apps", order: 15 } });
const ctxOf = (reg) => ({ root, registry: reg, base: { trailingSlash: true, observability: { csp: "x" }, headers: [], redirects: [] }, ...derive(reg) });

test("a duplicate slug is rejected", () => {
  const reg = registry([app(), app()]);
  assert.ok(validate(ctxOf(reg)).some((e) => /duplicate slug/.test(e)));
});

test("a reserved slug is rejected", () => {
  for (const slug of ["static", "categories", "404.html"]) {
    const errs = validate(ctxOf(registry([app({ slug, cards: [{ id: "x1", path: "", title: "t", summary: "s", category: "portfolio", icon: ICON, order: 1 }] })], { portfolio: { title: "P", order: 1 } })));
    assert.ok(errs.some((e) => /reserved/.test(e)), slug);
  }
  assert.ok(RESERVED.includes("_vercel"));
});

test("one app cannot claim another app's legacy path", () => {
  const a = app({ legacyRedirects: ["/decisions/"] });
  const b = app({ slug: "decisions", origin: "https://ij-decisions.vercel.app", legacyRedirects: ["/decisions/"], cards: [{ id: "d1", path: "", title: "D", summary: "s", category: "portfolio", icon: ICON, order: 1 }] });
  const errs = validate(ctxOf(registry([a, b])));
  assert.ok(errs.length, "expected a collision to be reported");
  assert.ok(errs.every((e) => e.startsWith('app "decisions"')), errs.join("\n"));
  assert.ok(errs.every((e) => e.includes('"portfolio"')), errs.join("\n"));
});

test("a missing icon file is reported", () => {
  const reg = registry([app({ cards: [{ id: "portfolio", path: "", title: "t", summary: "s", category: "portfolio", icon: "/static/img/apps/nope.svg", order: 1 }] })]);
  assert.ok(validate(ctxOf(reg)).some((e) => /icon file is missing/.test(e)));
});

test("a draft app renders a card but emits no rewrite", () => {
  const reg = registry([app({ status: "draft", sitemap: false })]);
  const ctx = ctxOf(reg);
  assert.equal(validate(ctx).length, 0);
  assert.equal(ctx.cards.length, 1);
  assert.equal(ctx.routed.length, 0);
  assert.deepEqual(JSON.parse(renderVercel(ctx)).rewrites, []);
});

test("a hidden app emits a rewrite but no card", () => {
  const reg = registry([app({ status: "hidden" })]);
  const ctx = ctxOf(reg);
  assert.equal(ctx.cards.length, 0);
  assert.equal(ctx.routed.length, 1);
  assert.equal(JSON.parse(renderVercel(ctx)).rewrites.length, 3);
});

test("sitemap true is only allowed for live apps", () => {
  for (const status of ["draft", "hidden"]) {
    const errs = validate(ctxOf(registry([app({ status, sitemap: true })])));
    assert.ok(errs.some((e) => /sitemap true requires status live/.test(e)), status);
  }
});

test("a category with no card is not rendered", () => {
  const reg = registry([app()], { portfolio: { title: "Portfolio", order: 10 }, tools: { title: "Tools", order: 20 } });
  const ctx = ctxOf(reg);
  assert.ok(validate(ctx).some((e) => /categoryMeta names "tools"/.test(e)));
  assert.ok(!ctx.orderedCategories.some((c) => c.id === "tools"));
});

test("a category named only by a card still renders, title-cased and last", () => {
  const reg = registry([app({ cards: [{ id: "portfolio", path: "", title: "t", summary: "s", category: "field-notes", icon: ICON, order: 10 }] })], {});
  const ctx = ctxOf(reg);
  assert.equal(validate(ctx).length, 0);
  assert.equal(ctx.orderedCategories[0].title, "Field Notes");
  assert.equal(ctx.orderedCategories[0].order, 999);
});

test("legacy redirects cover the slashed and unslashed source, both landing on a slash", () => {
  const plan = redirectPlan(app({ legacyRedirects: ["/decisions/", "/assets/:path*"] }));
  const bySource = Object.fromEntries(plan.map((r) => [r.source, r.destination]));
  assert.equal(bySource["/decisions/"], "/portfolio/decisions/");
  assert.equal(bySource["/decisions"], "/portfolio/decisions/");
  assert.equal(bySource["/assets/:path*"], "/portfolio/assets/:path*");
  assert.ok(!("/assets" in bySource), "a pattern source must not get an unslashed twin");
});

test("the landing renders one tile per card and never an inline style or script", () => {
  const ctx = ctxOf(registry([app()]));
  const html = renderLanding(root, ctx);
  assert.equal((html.match(/class="tile/g) || []).length, 1);
  assert.ok(!/<style|<script|style="/.test(html), html);
  assert.ok(/ij-portfolio|\/portfolio\//.test(html));
});

test("a category page carries its own heading and canonical", () => {
  const ctx = ctxOf(registry([app()]));
  const html = renderCategoryPage(root, ctx, ctx.orderedCategories[0]);
  assert.match(html, /<h1 class="hero">Portfolio<\/h1>/);
  assert.match(html, /rel="canonical" href="https:\/\/www\.ivanjairus\.xyz\/categories\/portfolio\/"/);
});

test("an external app links its card off-domain and routes nothing", () => {
  const ctx = ctxOf(offSite());
  assert.deepEqual(validate(ctx), []);
  assert.equal(ctx.cards[0].href, OFF_SITE);
  assert.equal(ctx.routed.length, 0);
  const vercel = JSON.parse(renderVercel(ctx));
  assert.deepEqual(vercel.rewrites, []);
  assert.deepEqual(vercel.redirects, []);
});

test("an external card names its own host instead of a gateway path", () => {
  const html = renderLanding(root, ctxOf(offSite()));
  assert.match(html, /<a class="tile" href="https:\/\/splitbill\.ivanjairus\.xyz\/">/);
  assert.match(html, /<span class="path mono">splitbill\.ivanjairus\.xyz<\/span>/);
  assert.ok(!html.includes("/splitbill/"), html);
});

test("an external app is live, publishes no sitemap and claims no gateway path", () => {
  const bad = [
    { status: "draft" },
    { status: "hidden" },
    { sitemap: true },
    { origin: "https://ij-splitbill.vercel.app" },
    { legacyRedirects: ["/bills/"] },
  ];
  for (const over of bad) {
    const errs = validate(ctxOf(offSite(over)));
    assert.ok(errs.length, `expected "${JSON.stringify(over)}" to be rejected`);
  }
});

test("an external URL is a public https origin, not a vercel.app host or the gateway", () => {
  const bad = [
    "https://ij-splitbill.vercel.app/",
    "https://www.ivanjairus.xyz/splitbill/",
    "http://splitbill.ivanjairus.xyz/",
    "https://splitbill.ivanjairus.xyz",
    "https://splitbill.ivanjairus.xyz/?token=1",
    "//splitbill.ivanjairus.xyz/",
  ];
  for (const external of bad) {
    const errs = validate(ctxOf(offSite({ external })));
    assert.ok(errs.some((e) => /external/.test(e)), `${external}: ${errs.join(" | ")}`);
  }
});

test("the gateway sitemap lists neither an external app nor its path", () => {
  const ctx = ctxOf(offSite());
  const xml = renderSitemapGateway(ctx);
  assert.ok(!xml.includes("/splitbill"), xml);
  assert.ok(!xml.includes("splitbill.ivanjairus.xyz"), xml);
  assert.match(xml, /categories\/apps\//);
});
