import { fileURLToPath } from "node:url";
import path from "node:path";
import { existsSync, readFileSync, writeFileSync, readdirSync, rmSync, mkdirSync, statSync } from "node:fs";

import { load } from "./lib/registry.mjs";
import { validate } from "./lib/validate.mjs";
import {
  renderLanding, renderCategoryPage, render404,
  renderVercel, renderSitemapGateway, renderSitemapIndex, renderRobots,
} from "./lib/render.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const check = process.argv.includes("--check");

const ctx = load();
const errors = validate(ctx);
if (errors.length) {
  console.error(`registry invalid, ${errors.length} problem(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

const files = new Map();
files.set("index.html", renderLanding(root, ctx));
files.set("404.html", render404(root, ctx));
files.set("vercel.json", renderVercel(ctx));
files.set("sitemap.xml", renderSitemapIndex(ctx));
files.set("sitemap-gateway.xml", renderSitemapGateway(ctx));
files.set("robots.txt", renderRobots(ctx));
for (const cat of ctx.orderedCategories) {
  files.set(`categories/${cat.id}/index.html`, renderCategoryPage(root, ctx, cat));
}

for (const [rel, content] of files) {
  const abs = path.join(root, rel);
  const onDisk = existsSync(abs) ? readFileSync(abs, "utf8") : null;
  if (check) {
    if (onDisk !== content) {
      console.error(`stale generated file: ${rel}${onDisk === null ? " (missing)" : ""}`);
      process.exitCode = 1;
    }
    continue;
  }
  if (onDisk !== content) {
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, content);
    console.log(`wrote ${rel}`);
  }
}

/* A category with no live or draft card left must not keep serving a page. */
const wanted = new Set(ctx.orderedCategories.map((c) => c.id));
if (!check && existsSync(path.join(root, "categories"))) {
  for (const dir of readdirSync(path.join(root, "categories"))) {
    if (!wanted.has(dir) && statSync(path.join(root, "categories", dir)).isDirectory()) {
      rmSync(path.join(root, "categories", dir), { recursive: true, force: true });
      console.log(`removed categories/${dir}`);
    }
  }
}

if (check) {
  console.log(process.exitCode ? "check failed: regenerate with node scripts/build.mjs" : `check ok: ${files.size} generated files match the registry`);
} else {
  console.log(`built ${files.size} files`);
}
