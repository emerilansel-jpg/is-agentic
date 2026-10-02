#!/usr/bin/env node
/**
 * generate-llms-txt.mjs — Scaffold an llms.txt (llmstxt.org format) for a site.
 *
 * Usage:
 *   node scripts/generate-llms-txt.mjs --name "My Site" --domain mysite.com [options]
 *
 * Options:
 *   --name <site name>          (required) Human name of the site/product.
 *   --domain <domain>           (required) Canonical domain, e.g. example.com.
 *   --description <text>        One-sentence summary for the blockquote.
 *   --framework <fw>            nextjs | astro | hugo | generic (default: generic).
 *                               Adds framework-typical sections/links as placeholders.
 *   --out <path>                Output file. Default: stdout.
 *   --full                      Also scaffold llms-full.txt next to --out.
 *   --links "Label|/path:desc;Label2|/path2:desc2"
 *                               Extra curated links to include under ## Resources.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const args = process.argv.slice(2);
function opt(flag) {
  const i = args.indexOf(flag);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : undefined;
}
const has = (flag) => args.includes(flag);

const name = opt("--name");
const domain = (opt("--domain") ?? "").replace(/^https?:\/\//, "").replace(/\/+$/, "");
const description = opt("--description");
const framework = (opt("--framework") ?? "generic").toLowerCase();
const outPath = opt("--out");
const extraLinksRaw = opt("--links");

if (!name || !domain) {
  console.error(
    'Usage: node scripts/generate-llms-txt.mjs --name "My Site" --domain mysite.com [--description "..."] [--framework nextjs|astro|hugo|generic] [--out ./public/llms.txt] [--full] [--links "Label|/path:desc;..."]'
  );
  process.exit(1);
}

const base = `https://${domain}`;

const FRAMEWORK_SECTIONS = {
  nextjs: [
    ["Docs", [
      ["Getting started", `${base}/docs`, "Setup and first steps"],
      ["App Router", `${base}/docs/app`, "Routing and layouts"],
      ["API reference", `${base}/docs/api`, "Endpoints and configuration"],
    ]],
  ],
  astro: [
    ["Docs", [
      ["Getting started", `${base}/docs`, "Setup and first steps"],
      ["Content collections", `${base}/docs/content`, "Structured content"],
      ["API reference", `${base}/docs/api`, "Endpoints and configuration"],
    ]],
  ],
  hugo: [
    ["Docs", [
      ["Getting started", `${base}/docs`, "Setup and first steps"],
      ["Content", `${base}/docs/content`, "Pages and front matter"],
      ["Reference", `${base}/docs/reference`, "Configuration reference"],
    ]],
  ],
  generic: [
    ["Docs", [
      ["Getting started", `${base}/docs`, "Setup and first steps"],
      ["API reference", `${base}/docs/api`, "Endpoints and configuration"],
    ]],
  ],
};

const PRODUCT_SECTION = [
  "Product",
  [
    ["Features", `${base}/features`, "What the product does"],
    ["Pricing", `${base}/pricing`, "Plans and limits"],
    ["Changelog", `${base}/changelog`, "What changed and when"],
  ],
];

function linkLine([label, url, desc]) {
  return `- [${label}](${url})${desc ? `: ${desc}` : ""}`;
}

function section([title, links]) {
  return `## ${title}\n\n${links.map(linkLine).join("\n")}`;
}

const sections = [];
const fw = FRAMEWORK_SECTIONS[framework] ?? FRAMEWORK_SECTIONS.generic;
sections.push(...fw.map(section));
sections.push(section(PRODUCT_SECTION));

if (extraLinksRaw) {
  const links = extraLinksRaw.split(";").filter(Boolean).map((entry) => {
    const [labelUrl, desc] = entry.split(":");
    const [label, path] = labelUrl.split("|");
    const url = path.startsWith("http") ? path : `${base}${path.startsWith("/") ? path : `/${path}`}`;
    return [label, url, desc];
  });
  sections.push(section(["Resources", links]));
}

sections.push(section([
  "Optional",
  [
    ["Blog", `${base}/blog`, "Announcements and guides"],
    ["Status", `${base}/status`, "Service status and uptime"],
  ],
]));

const llmsTxt = `# ${name}

> ${description ?? `${name} — TODO: replace with a one-sentence description of what this site/product does.`}

TODO: one short paragraph of context an LLM should know — audience, primary
offerings, canonical domain, how fresh the content is. Delete this line after editing.

${sections.join("\n\n")}
`;

const fullTxt = `# ${name} — Full Content

> ${description ?? `Expanded inline content for ${name}.`}

<!-- llms-full.txt inlines the full text of your most important pages so an
     LLM can consume everything in one fetch without crawling. Replace these
     placeholders with real page content at build time. -->

${sections.join("\n\n")}

## Full Pages

TODO: inline the complete markdown body of each key page here, separated by
horizontal rules and headed by the page title, e.g.:

---

## Page: Getting started

(full markdown content of ${base}/docs)
`;

function emit(file, content) {
  const abs = resolve(file);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content, "utf8");
  console.log(`[llms-txt] wrote ${abs} (${content.length} bytes)`);
}

if (outPath) {
  emit(outPath, llmsTxt);
  if (has("--full")) {
    emit(outPath.replace(/llms\.txt$/i, "llms-full.txt"), fullTxt);
  }
  console.log("\nRemember:");
  console.log(`  - Serve as text/markdown; charset=utf-8 at ${base}/llms.txt`);
  console.log("  - Regenerate on deploy so links never go stale.");
  console.log("  - Verify: curl -s " + base + "/llms.txt");
} else {
  process.stdout.write(llmsTxt);
}
