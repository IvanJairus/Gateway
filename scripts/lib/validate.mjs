import { existsSync } from "node:fs";
import path from "node:path";
import { RESERVED } from "./registry.mjs";

const SLUG = /^[a-z0-9-]+$/;
const ORIGIN = /^https:\/\/ij-[a-z0-9-]+\.vercel\.app$/;
const EXTERNAL = /^https:\/\/[a-z0-9]([a-z0-9.-]*[a-z0-9])?\/$/;
const VERCEL_HOST = /\.vercel\.app$/;
const LEGACY = /^\/[A-Za-z0-9._/:*()-]+$/;
const ICON = /^\/static\/img\/apps\/[a-z0-9-]+\.svg$/;
const CARD_PATH = /^([a-z0-9-]+\/)*$/;
const STATUSES = ["live", "hidden", "draft"];

export function validate({ root, registry, cards, owners, orderedCategories }) {
  const errors = [];
  const err = (m) => errors.push(m);

  if (!registry.site || !/^https:\/\/www\.[a-z0-9.-]+$/.test(registry.site.origin || "")) {
    err("site.origin must be an https www origin");
  }
  if (!Array.isArray(registry.apps) || !registry.apps.length) err("apps must be a non-empty array");

  const seenSlug = new Set();
  const seenCardId = new Set();
  const siteHost = String(registry.site.origin || "").replace(/^https:\/\//, "").toLowerCase();

  for (const app of registry.apps) {
    const at = `app "${app.slug || "??"}"`;

    if (!SLUG.test(app.slug || "")) err(`${at}: slug must match ${SLUG}`);
    if (seenSlug.has(app.slug)) err(`${at}: duplicate slug`);
    seenSlug.add(app.slug);

    if (RESERVED.includes(app.slug)) err(`${at}: slug "${app.slug}" is a reserved gateway path`);
    const claimed = owners.get(app.slug);
    if (claimed && claimed !== app.slug) err(`${at}: slug is already claimed as a legacy path by app "${claimed}"`);

    /* An external app is linked, not proxied: it owns no gateway path, so the
       rules that keep a proxy honest are replaced by rules that keep the link
       honest. A vercel.app host here would put a per-app origin in served markup. */
    if (app.external) {
      const host = app.external.replace(/^https:\/\//, "").replace(/\/$/, "").toLowerCase();
      if (!EXTERNAL.test(app.external)) {
        err(`${at}: external must be an https origin with a trailing slash and no path, got "${app.external}"`);
      } else if (VERCEL_HOST.test(host)) {
        err(`${at}: an external app must name its own domain, not a vercel.app host`);
      } else if (host === siteHost) {
        err(`${at}: an external app cannot point back at the gateway itself`);
      }
      if (app.origin) err(`${at}: an external app must not also declare an origin`);
      if (app.status !== "live") err(`${at}: an external app is only useful as a live card, not "${app.status}"`);
      if (app.sitemap) err(`${at}: an external app cannot publish a sitemap through the gateway`);
      if ((app.legacyRedirects || []).length) err(`${at}: an external app claims no gateway paths`);
    } else if (!ORIGIN.test(app.origin || "")) {
      err(`${at}: origin must match ${ORIGIN}`);
    }
    if (!STATUSES.includes(app.status)) err(`${at}: status must be one of ${STATUSES.join(", ")}`);
    if (typeof app.sitemap !== "boolean") err(`${at}: sitemap must be true or false`);
    if (app.sitemap && app.status !== "live") err(`${at}: sitemap true requires status live`);
    if (app.status === "draft" && (app.legacyRedirects || []).length) err(`${at}: a draft app cannot claim legacy paths yet`);

    if (existsSync(path.join(root, app.slug)) || existsSync(path.join(root, `${app.slug}.html`))) {
      err(`${at}: slug collides with a file or directory in the repository root`);
    }

    for (const legacy of app.legacyRedirects || []) {
      if (!LEGACY.test(legacy)) err(`${at}: legacyRedirects entry "${legacy}" is not an absolute path pattern`);
      const seg = firstSeg(legacy);
      if (!seg) continue;
      if (RESERVED.includes(seg)) err(`${at}: legacy path "/${seg}" collides with a reserved gateway path`);
      const owner = owners.get(seg);
      if (owner && owner !== app.slug) err(`${at}: legacy path "/${seg}" is owned by app "${owner}"`);
    }

    if (!Array.isArray(app.cards) || !app.cards.length) err(`${at}: needs at least one card`);

    for (const card of app.cards || []) {
      const cat = `${at} card "${card.id || "??"}"`;
      if (!SLUG.test(card.id || "")) err(`${cat}: id must match ${SLUG}`);
      if (seenCardId.has(card.id)) err(`${cat}: duplicate card id across the registry`);
      seenCardId.add(card.id);
      if (!CARD_PATH.test(card.path || "")) err(`${cat}: path must be zero or more slash-terminated segments, got "${card.path}"`);
      if (!card.title || !card.summary) err(`${cat}: title and summary are required`);
      if (!SLUG.test(card.category || "")) err(`${cat}: category must match ${SLUG}`);
      if (!Number.isInteger(card.order)) err(`${cat}: order must be an integer`);
      if (!ICON.test(card.icon || "")) err(`${cat}: icon must match ${ICON}`);
      else if (!existsSync(path.join(root, card.icon.replace(/^\//, "")))) err(`${cat}: icon file is missing on disk (${card.icon})`);
    }
  }

  const declared = Object.keys(registry.categoryMeta || {});
  for (const id of declared) {
    if (!orderedCategories.some((c) => c.id === id)) err(`categoryMeta names "${id}" but no live or draft card uses it`);
  }

  for (const c of orderedCategories) {
    const titles = c.cards.map((card) => card.title);
    if (new Set(titles).size !== titles.length) err(`category "${c.id}" has two cards with the same title`);
  }

  return errors;
}

function firstSeg(s) {
  return String(s || "").replace(/^\//, "").split("/")[0].split(":")[0];
}
