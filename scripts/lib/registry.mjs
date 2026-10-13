import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const readJSON = (rel) => JSON.parse(readFileSync(path.join(root, rel), "utf8"));

export const RESERVED = [
  "static", "categories", "api", "_vercel", ".well-known",
  "sitemap.xml", "sitemap-gateway.xml", "robots.txt", "404.html", "index.html",
];

export function load() {
  const registry = readJSON("registry/apps.json");
  const base = readJSON("registry/vercel.base.json");
  return { root, registry, base, ...derive(registry) };
}

/* A category exists only because some card claims it, so categoryMeta may name
   nothing and a card may name a category nobody declared yet. */
export function derive(registry) {
  const apps = registry.apps;

  /* Which app owns a top-level path. First claim wins so a collision is reported
     against whoever arrived second, not twice. */
  const owners = new Map();
  const claim = (seg, owner) => { if (seg && !owners.has(seg)) owners.set(seg, owner); };
  for (const a of apps) {
    claim(a.slug, a.slug);
    for (const legacy of a.legacyRedirects || []) claim(firstSegment(legacy), a.slug);
  }

  const reserved = [...RESERVED, ...owners.keys()];

  const cards = apps
    .filter((a) => a.status !== "hidden")
    .flatMap((a) => a.cards.map((c) => ({
      ...c,
      appSlug: a.slug,
      appStatus: a.status,
      href: `/${a.slug}/${c.path}`,
    })));

  const categories = new Map();
  for (const card of cards) {
    if (!categories.has(card.category)) categories.set(card.category, []);
    categories.get(card.category).push(card);
  }

  const metaFor = (id) => {
    const declared = registry.categoryMeta && registry.categoryMeta[id];
    return declared || { title: titleCase(id), order: 999 };
  };

  const orderedCategories = [...categories.entries()]
    .map(([id, list]) => ({
      id,
      title: metaFor(id).title,
      order: metaFor(id).order,
      cards: list.slice().sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)),
    }))
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));

  const routed = apps.filter((a) => a.status === "live" || a.status === "hidden");

  return { cards, categories, orderedCategories, reserved, owners, routed };
}

function firstSegment(p) {
  return p.replace(/^\//, "").split("/")[0].split(":")[0];
}

function titleCase(id) {
  return id.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

/* trailingSlash is on, so every destination ends in a slash: an unslash source
   has to land on the final URL or the hop budget is spent on normalisation. */
export function redirectPlan(app) {
  const out = [{ source: `/${app.slug}`, destination: `/${app.slug}/` }];
  for (const legacy of app.legacyRedirects || []) {
    const dest = `/${app.slug}${legacy}`;
    out.push({ source: legacy, destination: dest });
    if (legacy.endsWith("/") && !legacy.includes(":")) {
      out.push({ source: legacy.slice(0, -1), destination: dest });
    }
  }
  return out;
}

export function rewritePlan(app) {
  return [
    { source: `/${app.slug}/`, destination: `${app.origin}/${app.slug}/` },
    { source: `/${app.slug}/:path*/`, destination: `${app.origin}/${app.slug}/:path*/` },
    { source: `/${app.slug}/:path*`, destination: `${app.origin}/${app.slug}/:path*` },
  ];
}
