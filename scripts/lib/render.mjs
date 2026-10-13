import { readFileSync } from "node:fs";
import path from "node:path";
import { redirectPlan, rewritePlan } from "./registry.mjs";

const tplCache = new Map();

function tpl(root, name) {
  if (!tplCache.has(name)) tplCache.set(name, readFileSync(path.join(root, "templates", name), "utf8"));
  return tplCache.get(name);
}

export const esc = (s) => String(s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function fill(tplText, tokens) {
  const out = tplText.replace(/\{\{([a-z_]+)\}\}/g, (_, key) => {
    if (!(key in tokens)) throw new Error(`template token {{${key}}} has no value`);
    return tokens[key];
  });
  const left = out.match(/\{\{[a-z_]+\}\}/);
  if (left) throw new Error(`unresolved template token ${left[0]}`);
  return out;
}

const STATUS_WORD = { live: "live · 200", draft: "draft · not built yet" };

export function renderCard(root, card) {
  const live = card.appStatus === "live";
  return fill(tpl(root, "card.html"), {
    tile_class: live ? "" : " draft",
    href: esc(card.href),
    category: esc(card.category),
    icon: esc(card.icon),
    title: esc(card.title),
    summary: esc(card.summary),
    path_label: esc(`/${card.appSlug}/${card.path}`),
    open: live ? '<span class="go mono">open →</span>' : "",
    glyph: live ? "solid" : "hollow",
    status_word: esc(STATUS_WORD[card.appStatus]),
  }).trimEnd();
}

export function renderCategorySection(root, category) {
  const cards = category.cards.map((c) => renderCard(root, c)).join("\n");
  return fill(tpl(root, "category-section.html"), {
    id: esc(category.id),
    title: esc(category.title),
    count: String(category.cards.length),
    count_word: category.cards.length === 1 ? "entry" : "entries",
    cards,
  }).trimEnd();
}

/* The landing keeps one grid and puts the category in the tile corner: a section
   per category would give one heading to a single card while there are two apps. */
export function renderLanding(root, ctx) {
  const cards = ctx.cards.map((c) => renderCard(root, c)).join("\n");
  const site = ctx.registry.site;
  const body = [
    "    <div class=\"hero-band\">",
    "      <div class=\"wrap hero-inner\">",
    `        <h1 class="hero">${esc(site.hero || site.title)}</h1>`,
    `        <p class="sub">${esc(site.sub || "")}</p>`,
    "      </div>",
    "    </div>",
    "    <div class=\"wrap\">",
    "      <div class=\"sheet\">",
    cards,
    "      </div>",
    "    </div>",
  ].join("\n");

  return layout(root, ctx, {
    title: `${site.title} · gateway`,
    description: "Entry point for everything published under this domain.",
    canonical: `${site.origin}/`,
    body,
  });
}

export function renderCategoryPage(root, ctx, category) {
  const body = [
    "    <div class=\"wrap\">",
    `      <h1 class="hero">${esc(category.title)}</h1>`,
    renderCategorySection(root, category),
    "    </div>",
  ].join("\n");

  return layout(root, ctx, {
    title: `${category.title} · ${ctx.registry.site.title}`,
    description: `Everything filed under ${category.title.toLowerCase()} on this gateway.`,
    canonical: `${ctx.registry.site.origin}/categories/${category.id}/`,
    body,
  });
}

export function render404(root, ctx) {
  const links = ctx.orderedCategories
    .map((c) => `        <li><a href="/categories/${esc(c.id)}/">${esc(c.title)}</a></li>`)
    .join("\n");
  const body = [
    "    <div class=\"wrap\">",
    "      <h1 class=\"hero\">Nothing lives at this address.</h1>",
    "      <p class=\"sub\">The gateway serves the paths below. Everything else is a 404 on purpose.</p>",
    "      <ul class=\"page-list\">",
    "        <li><a href=\"/\">/ gateway</a></li>",
    links,
    "      </ul>",
    "    </div>",
  ].join("\n");

  return layout(root, ctx, {
    title: `Not found · ${ctx.registry.site.title}`,
    description: "This path is not served by the gateway.",
    canonical: `${ctx.registry.site.origin}/404.html`,
    body,
  });
}

function layout(root, ctx, { title, description, canonical, body }) {
  const site = ctx.registry.site;
  return fill(tpl(root, "layout.html"), {
    title: esc(title),
    description: esc(description),
    canonical: esc(canonical),
    csp: esc(ctx.base.observability.csp),
    site_title: esc(site.title),
    site_origin_label: esc(site.origin.replace(/^https:\/\//, "")),
    monogram: esc(site.monogram || ""),
    body,
  });
}

export function renderVercel(ctx) {
  const slugs = ctx.routed.map((a) => a.slug);
  /* App paths keep the CSP their own project sets. Two CSP headers intersect and
     the strictest wins, which would break an app without any visible error. */
  const scoped = slugs.length
    ? `/((?!${slugs.map((s) => `${s}(?:/|$)`).join("|")}).*)`
    : "/(.*)";

  const headers = ctx.base.headers.map((rule) => ({
    /* An empty source means "every gateway page"; a written source such as
       /static/(.*) is already gateway-only and needs no lookahead. */
    source: rule.source === "" ? scoped : rule.source,
    headers: rule.headers.map((h) => ({
      key: h.key,
      value: h.valueRef ? ctx.base.observability[h.valueRef] : h.value,
    })),
  }));

  const redirects = [];
  const rewrites = [];
  for (const app of ctx.registry.apps) {
    if (app.status === "draft") continue;
    redirects.push(...redirectPlan(app).map((r) => ({ ...r, permanent: true })));
    rewrites.push(...rewritePlan(app));
  }

  return `${JSON.stringify({
    trailingSlash: ctx.base.trailingSlash,
    redirects,
    rewrites,
    headers,
  }, null, 2)}\n`;
}

export function renderSitemapGateway(ctx) {
  const urls = ["/", ...ctx.orderedCategories.map((c) => `/categories/${c.id}/`)];
  for (const app of ctx.registry.apps) {
    if (app.status === "live" && !app.sitemap) urls.push(`/${app.slug}/`);
  }
  return urlset(ctx.registry.site.origin, urls);
}

export function renderSitemapIndex(ctx) {
  const children = ["/sitemap-gateway.xml"];
  for (const app of ctx.registry.apps) if (app.sitemap) children.push(`/${app.slug}/sitemap.xml`);
  return sitemapindex(ctx.registry.site.origin, children);
}

function urlset(origin, paths) {
  const items = paths.map((p) => `  <url><loc>${origin}${p}</loc></url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items}\n</urlset>\n`;
}

function sitemapindex(origin, paths) {
  const items = paths.map((p) => `  <sitemap><loc>${origin}${p}</loc></sitemap>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items}\n</sitemapindex>\n`;
}

export function renderRobots(ctx) {
  return `Sitemap: ${ctx.registry.site.origin}/sitemap.xml\n\nUser-agent: *\nAllow: /\n`;
}
