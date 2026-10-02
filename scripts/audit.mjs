#!/usr/bin/env node
/**
 * audit.mjs — Run an is-agentic.com audit against a domain and print a
 * prioritized, human-readable action report.
 *
 * Usage:
 *   node scripts/audit.mjs <domain> [--json] [--api-only]
 *
 * Strategy:
 *   1. Try `npx --yes is-agentic <domain> --json`
 *   2. Fall back to REST: https://is-agentic.com/api/v1/report?url=https://<domain>
 *
 * Exit codes: 0 = report produced, 1 = usage error, 2 = audit failed.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

const args = process.argv.slice(2);
const rawDomain = args.find((a) => !a.startsWith("--"));
const wantsRawJson = args.includes("--json");
const apiOnly = args.includes("--api-only");

if (!rawDomain) {
  console.error("Usage: node scripts/audit.mjs <domain> [--json] [--api-only]");
  process.exit(1);
}

const domain = rawDomain.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
const siteUrl = `https://${domain}`;

function normalizeUrl(u) {
  return u.replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

async function runCli() {
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  const { stdout } = await execFileP(
    npx,
    ["--yes", "is-agentic", domain, "--json"],
    { timeout: 180_000, maxBuffer: 32 * 1024 * 1024 }
  );
  return JSON.parse(stdout);
}

async function runApi() {
  const res = await fetch(
    `https://is-agentic.com/api/v1/report?url=${encodeURIComponent(siteUrl)}`,
    { headers: { accept: "application/json" } }
  );
  if (!res.ok) throw new Error(`API returned HTTP ${res.status}`);
  return res.json();
}

async function getReport() {
  if (!apiOnly) {
    try {
      return { report: await runCli(), source: "cli" };
    } catch (err) {
      console.error(`[audit] CLI unavailable (${err.message}); falling back to REST API...`);
    }
  }
  return { report: await runApi(), source: "api" };
}

/** Recursively collect check-like objects: anything with a status/result + name/id. */
function collectChecks(node, path = [], out = []) {
  if (Array.isArray(node)) {
    node.forEach((item, i) => collectChecks(item, [...path, String(i)], out));
    return out;
  }
  if (node && typeof node === "object") {
    const status = node.status ?? node.result ?? node.state;
    const name = node.name ?? node.id ?? node.check ?? node.title;
    if (typeof status === "string" && name) {
      out.push({
        path: path.join("."),
        section: path[0] ?? "general",
        name: String(name),
        status: status.toLowerCase(),
        message: node.message ?? node.description ?? node.detail ?? "",
        recommendation: node.recommendation ?? node.fix ?? node.remediation ?? "",
      });
    }
    for (const [k, v] of Object.entries(node)) {
      if (v && typeof v === "object") collectChecks(v, [...path, k], out);
    }
  }
  return out;
}

function findScore(report) {
  const candidates = [report.score, report.overall_score, report.overallScore, report.grade, report.rating];
  for (const c of candidates) if (c !== undefined && c !== null) return c;
  if (report.summary && typeof report.summary === "object") {
    return report.summary.score ?? report.summary.overall ?? null;
  }
  return null;
}

const PASS_WORDS = new Set(["pass", "passed", "ok", "success", "good", "green", "passing"]);
const FAIL_WORDS = new Set(["fail", "failed", "error", "bad", "red", "failing", "critical"]);
const WARN_WORDS = new Set(["warn", "warning", "partial", "yellow", "info", "notice"]);

const ACTION_HINTS = [
  [/llms[-_. ]?full/i, "Create /llms-full.txt with expanded inline content (see SKILL.md Recipe 1)."],
  [/llms\.?txt/i, "Create /llms.txt at the site root (see SKILL.md Recipe 1)."],
  [/api[-_. ]?catalog|rfc ?9727/i, "Publish /.well-known/api-catalog as linkset+json (see SKILL.md Recipe 3)."],
  [/ai[-_. ]?catalog/i, "Publish /.well-known/ai-catalog.json (see SKILL.md Recipe 3)."],
  [/mcp/i, "Expose or declare an MCP server endpoint (see SKILL.md Recipe 3)."],
  [/markdown|content[-_. ]?negotiation|vary/i, "Implement Accept: text/markdown negotiation with Vary: Accept (see SKILL.md Recipe 2)."],
  [/ssr|server[-_. ]?render|pre[-_. ]?render|javascript|client[-_. ]?side/i, "Ensure primary content is server-rendered (see SKILL.md Recipe 4)."],
  [/status|404|soft/i, "Return correct HTTP status codes — no soft 404s (see SKILL.md Recipe 5)."],
  [/semantic|h1|heading|landmark|<main>|<article>/i, "Fix document semantics: one H1, landmark elements (see SKILL.md Recipe 4)."],
  [/canonical|og:|open ?graph|meta|lang|description/i, "Add discovery metadata: canonical, Open Graph, meta description, html lang (see SKILL.md Recipe 4)."],
  [/recover|error/i, "Make errors machine-recoverable: real status codes, Retry-After, JSON error bodies (see SKILL.md Recipe 5)."],
  [/openapi|graphql|oauth|api/i, "Publish machine-readable API descriptions (OpenAPI/GraphQL/OAuth) — see SKILL.md Recipes 3 & 5."],
];

function hintFor(check) {
  const text = `${check.name} ${check.message}`;
  for (const [re, hint] of ACTION_HINTS) if (re.test(text)) return hint;
  return check.recommendation || "Review this item against the recipes in SKILL.md.";
}

function printReport(report, source) {
  const score = findScore(report);
  const checks = collectChecks(report);
  const failed = checks.filter((c) => FAIL_WORDS.has(c.status));
  const warned = checks.filter((c) => WARN_WORDS.has(c.status));
  const passed = checks.filter((c) => PASS_WORDS.has(c.status));

  console.log("=".repeat(70));
  console.log(`is-agentic audit: ${siteUrl}  (source: ${source})`);
  console.log("=".repeat(70));
  if (score !== null) console.log(`SCORE: ${typeof score === "object" ? JSON.stringify(score) : score}`);
  console.log(`Checks found: ${checks.length}  |  passed: ${passed.length}  warnings: ${warned.length}  failed: ${failed.length}`);

  if (failed.length) {
    console.log("\n--- FAILING (fix these first, in order) ---");
    failed.forEach((c, i) => {
      console.log(`\n${i + 1}. [${c.section}] ${c.name}`);
      if (c.message) console.log(`   issue:  ${c.message}`);
      console.log(`   action: ${hintFor(c)}`);
    });
  }

  if (warned.length) {
    console.log("\n--- WARNINGS (fix after failures are green) ---");
    warned.forEach((c) => {
      console.log(`- [${c.section}] ${c.name}${c.message ? ` — ${c.message}` : ""}`);
    });
  }

  if (passed.length) {
    console.log("\n--- PASSED ---");
    passed.forEach((c) => console.log(`+ [${c.section}] ${c.name}`));
  }

  if (!checks.length) {
    console.log("\nNo structured checks could be parsed from the report.");
    console.log("Re-run with --json to inspect the raw payload:");
    console.log(`  node scripts/audit.mjs ${domain} --json`);
  }

  console.log("\nNext steps: apply the matching recipes from SKILL.md, then re-run this audit");
  console.log("and compare against this score as your baseline.");
}

try {
  const { report, source } = await getReport();
  if (wantsRawJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report, source);
  }
  process.exit(0);
} catch (err) {
  console.error(`[audit] FAILED: ${err.message}`);
  process.exit(2);
}
