---
name: is-agentic
description: Audit and optimize websites for AI agents, synthetic clients, and LLM web crawlers using is-agentic.com standards and CLI.
---

# is-agentic — Agentic Readiness Auditor & Optimizer

Use this skill whenever a user wants to know whether a website works well for **AI agents** (LLM crawlers, synthetic shoppers, research bots, autonomous assistants, MCP clients), or wants to **fix** a site so agents can read, navigate, and transact on it.

## Overview & Philosophy

The next wave of web traffic is not human. LLMs answering questions, synthetic shoppers comparing products, research bots compiling citations, and autonomous agents executing tasks all consume the web *without a browser, without JavaScript patience, and without a human to recover from errors*.

A site that scores 100 on Lighthouse can still be **invisible or hostile to agents**:

- Content only appears after client-side rendering → the agent sees an empty shell.
- 404s return HTTP 200 ("soft 404") → the agent indexes garbage.
- No `llms.txt`, no API catalog → the agent can't discover what the site offers or how to use it programmatically.
- No content negotiation → the agent must parse 200KB of HTML/nav/footers to extract 2KB of meaning.
- Cryptic error pages → an autonomous agent cannot recover and abandons the task.

**is-agentic.com** is the reference evaluator for this. It grades a public web property across:

1. **Essential Checks** (score drivers)
   - Server-rendered content (SSR / pre-rendered HTML — no hard dependency on client-side JS for primary content).
   - Correct HTTP status codes & behavior (real 404s, correct redirects, no soft-404s).
   - Clean document semantics (proper H1–H6 hierarchy, semantic tags like `<main>`, `<article>`, `<nav>`, accessible form controls with labels).
   - Error recoverability (an agent can tell what went wrong and what to do next).
   - Discovery metadata (`<html lang>`, `<link rel="canonical">`, Open Graph `og:title` / `og:description` / `og:image`, meta description).
2. **Catalogs & Agent Discovery**
   - `llms.txt` and `llms-full.txt` at the site root.
   - RFC 9727 API Catalog at `/.well-known/api-catalog`.
   - AI catalog at `/.well-known/ai-catalog.json`.
   - MCP server endpoints.
3. **Content Negotiation**
   - Clean markdown served for `Accept: text/markdown` requests, with a proper `Vary: Accept` header.
4. **Recommended Checks**
   - Discovered APIs, OpenAPI specs, GraphQL endpoints, OAuth, structured commerce data.

The workflow is always: **audit → interpret → apply recipes → re-audit.**

## Audit Workflow

### Step 1 — Run the audit

Preferred (CLI):

```bash
npx is-agentic <domain> --json
```

Human-readable version (omit `--json`):

```bash
npx is-agentic <domain>
```

Fallback (REST API, no CLI needed):

```bash
curl -s "https://is-agentic.com/api/v1/report?url=https://<domain>"
```

API schema lives at `https://is-agentic.com/openapi.json`. A read-only MCP server is available at `https://is-agentic.com/mcp` if the host supports MCP resources.

Convenience wrapper (bundled with this skill):

```bash
node scripts/audit.mjs <domain>
```

It runs the CLI (falling back to the REST API), parses the JSON, and prints a prioritized action list.

### Step 2 — Interpret the report

Read the JSON output and extract:

| Field / Section | What to do with it |
|---|---|
| Overall score | Baseline. Record it before making changes. |
| **Essential checks** — failing items | These drive the score. Fix ALL of these first. |
| **Recommended checks** — failing items | Fix after Essentials are green. |
| Catalog/discovery checks (`llms.txt`, well-known endpoints) | Usually quick wins — see Recipes 1 & 3. |
| Content negotiation check | See Recipe 2. |
| Agent journey trace | Shows exactly what an agent saw (raw HTML, status codes, missing metadata). Use it to confirm each fix. |

Prioritization rule: **Essential > Content Negotiation > Catalogs > Recommended.** A perfect `llms.txt` on a JS-only SPA still fails, because the agent never gets to the content.

## Optimization Recipes

### Recipe 1 — `llms.txt` and `llms-full.txt`

`llms.txt` is a markdown file at the site root (`/llms.txt`) that tells LLMs what the site is and where the important content lives. `llms-full.txt` is the expanded version with full content inline.

**Placement:** `https://<domain>/llms.txt` (and `/llms-full.txt`), served as `text/markdown; charset=utf-8`, publicly accessible, not blocked by robots.txt or auth.

**Template:**

```markdown
# Site Name

> One-sentence description of what this site/product does.

Optional short paragraph with context an LLM should know: audience,
primary offerings, canonical domain, content freshness.

## Docs
- [Getting started](https://example.com/docs/start): How to begin
- [API reference](https://example.com/docs/api): Endpoints and auth

## Product
- [Pricing](https://example.com/pricing): Plans and limits
- [Changelog](https://example.com/changelog): What changed when

## Optional
- [Blog](https://example.com/blog): Announcements and guides
```

Rules:
- Start with a single `# H1` = site name, then a `>` blockquote summary.
- Use `## H2` sections of markdown link lists; each link gets a `:` one-line description.
- Keep `llms.txt` curated (dozens of links, not thousands). Put exhaustive content in `llms-full.txt`.
- Anything under an `## Optional` section may be skipped by context-constrained agents.
- Regenerate on deploy; stale `llms.txt` is worse than none.

Scaffold one automatically:

```bash
node scripts/generate-llms-txt.mjs --name "My Site" --domain mysite.com --framework nextjs --out ./public/llms.txt
```

### Recipe 2 — Content Negotiation (`Accept: text/markdown`)

When a client sends `Accept: text/markdown`, serve a clean markdown representation of the page instead of HTML — and always send `Vary: Accept` so caches don't poison one representation with the other.

**Test it:**

```bash
curl -s -H "Accept: text/markdown" -D - https://<domain>/some-page | head -30
# Expect: content-type: text/markdown ... and a `vary: Accept` header
```

**Next.js (middleware / route handler):**

```ts
// middleware.ts
import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const accept = req.headers.get("accept") ?? "";
  if (accept.includes("text/markdown") && !accept.includes("text/html")) {
    const url = req.nextUrl.clone();
    url.pathname = `/api/markdown${url.pathname}`; // rewrite to markdown renderer
    const res = NextResponse.rewrite(url);
    res.headers.set("Vary", "Accept");
    return res;
  }
  const res = NextResponse.next();
  res.headers.set("Vary", "Accept");
  return res;
}
```

```ts
// app/api/markdown/[...path]/route.ts
import { NextResponse } from "next/server";
import { renderPageAsMarkdown } from "@/lib/markdown"; // your content source -> md

export async function GET(_: Request, { params }: { params: { path: string[] } }) {
  const md = await renderPageAsMarkdown("/" + params.path.join("/"));
  if (!md) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(md, {
    headers: { "content-type": "text/markdown; charset=utf-8", "vary": "Accept" },
  });
}
```

**Cloudflare Worker (edge negotiation):**

```ts
export default {
  async fetch(request: Request): Promise<Response> {
    const accept = request.headers.get("Accept") ?? "";
    const wantsMarkdown = accept.includes("text/markdown") && !accept.includes("text/html");

    if (wantsMarkdown) {
      const md = await lookupMarkdown(new URL(request.url).pathname); // KV/R2/origin
      if (md) {
        return new Response(md, {
          headers: { "content-type": "text/markdown; charset=utf-8", "vary": "Accept" },
        });
      }
    }
    const res = await fetch(request);
    const headers = new Headers(res.headers);
    headers.set("Vary", "Accept");
    return new Response(res.body, { status: res.status, headers });
  },
};
```

**Express:**

```js
app.use((req, res, next) => {
  res.set("Vary", "Accept");
  next();
});

app.get("*", async (req, res, next) => {
  const acceptsMarkdown = req.accepts(["text/markdown", "text/html"]) === "text/markdown";
  if (acceptsMarkdown) {
    const md = await renderPageAsMarkdown(req.path);
    if (md) return res.type("text/markdown").send(md);
  }
  next(); // fall through to normal HTML handler
});
```

Key points: render markdown from your **content source** (CMS/MDX/DB), not by scraping your own HTML; markdown for a missing page must still 404; `Vary: Accept` is mandatory.

### Recipe 3 — Machine Catalogs (`/.well-known/...`)

**AI catalog** — `/.well-known/ai-catalog.json`, served as `application/json`:

```json
{
  "name": "Example",
  "description": "What this site offers, in one sentence.",
  "url": "https://example.com",
  "llms_txt": "https://example.com/llms.txt",
  "llms_full_txt": "https://example.com/llms-full.txt",
  "apis": [
    {
      "name": "Example REST API",
      "base_url": "https://api.example.com/v1",
      "openapi": "https://api.example.com/openapi.json",
      "auth": { "type": "oauth2", "authorization_url": "https://example.com/oauth/authorize" }
    }
  ],
  "mcp_servers": [
    { "name": "example-mcp", "url": "https://example.com/mcp", "transport": "streamable-http" }
  ],
  "contact": "agents@example.com"
}
```

**RFC 9727 API catalog** — `/.well-known/api-catalog`, served as `application/linkset+json` (RFC 9264 linkset):

```json
{
  "linkset": [
    {
      "anchor": "https://api.example.com/",
      "service-desc": [{ "href": "https://api.example.com/openapi.json", "type": "application/json" }],
      "service-doc": [{ "href": "https://example.com/docs/api", "type": "text/html" }],
      "status": [{ "href": "https://status.example.com", "type": "text/html" }]
    }
  ]
}
```

Both files are static — commit them into `public/` (Next.js/Astro), the assets directory (Workers/Pages), or serve them from your CDN. Verify with:

```bash
curl -s https://<domain>/.well-known/ai-catalog.json | jq .
curl -s https://<domain>/.well-known/api-catalog | jq .
```

### Recipe 4 — Semantic HTML & Document Architecture

Goal: primary content is present and meaningful in the **initial HTML payload**, before any JavaScript runs.

Checklist:

- **SSR / pre-render.** Product pages, articles, docs, pricing — anything an agent might need — must be server-rendered or statically generated. Test: `curl -s https://<domain>/page | grep "primary headline"` must find the content.
- **One H1 per page.** Logical H1→H2→H3 nesting, never skip levels for styling.
- **Landmark elements.** `<header>`, `<nav>`, `<main>` (exactly one), `<article>` for self-contained content, `<aside>`, `<footer>`. Don't bury the article in nested `<div class="content-wrapper-inner">`.
- **Accessible forms.** Every input has a `<label for>` or `aria-label`; buttons have discernible text (not icon-only); errors are associated via `aria-describedby`.
- **Discovery metadata in `<head>`:**
  ```html
  <html lang="en">
  <title>Descriptive page title</title>
  <meta name="description" content="One-sentence page summary.">
  <link rel="canonical" href="https://example.com/current-page">
  <meta property="og:title" content="...">
  <meta property="og:description" content="...">
  <meta property="og:image" content="https://example.com/og/page.png">
  ```
- **Structured data** where applicable: JSON-LD `Article`, `Product` (with offers/price), `FAQPage`, `Organization`.
- **Hydration safety.** SSR HTML must match the client tree — hydration mismatches can wipe server-rendered content agents already consumed.
- **robots.txt sanity.** Don't block AI crawlers you actually want (check rules for `GPTBot`, `ClaudeBot`, `PerplexityBot`, etc.) and reference your sitemap.

### Recipe 5 — Error Boundaries & Recoverable HTTP States

Autonomous agents retry, follow, or abort based on status codes. Get them right:

- **Real 404s.** Missing content returns HTTP 404/410 with a helpful body — never HTTP 200 with an error message ("soft 404").
- **Correct redirect semantics.** 301/308 for permanent moves, 302/307 for temporary. No redirect chains > 2 hops; no redirect loops.
- **Rate limiting that communicates.** 429 must include `Retry-After`. Body should say what the limit is and how to authenticate for a higher tier.
- **Auth failures that guide.** 401 includes `WWW-Authenticate` and a link to obtain credentials; 403 explains that access is forbidden, not that the resource is missing.
- **5xx honesty.** Return 503 (with `Retry-After`) during maintenance instead of timing out or serving a broken 200.
- **Useful error bodies.** Machine-readable where possible:
  ```json
  { "error": "not_found", "message": "No product with id 'abc'", "docs": "https://example.com/docs/api#errors" }
  ```
- **robots.txt errors.** A 5xx on `/robots.txt` makes crawlers assume *everything* is disallowed — serve it reliably (200 or a clean 404).

## Verification & Re-audit Checklist

After applying fixes:

1. `node scripts/audit.mjs <domain>` (or `npx is-agentic <domain> --json`) — score should rise; zero failing Essential checks.
2. `curl -s https://<domain>/llms.txt` — 200, `text/markdown`, non-empty.
3. `curl -s -H "Accept: text/markdown" -D - https://<domain>/` — markdown body, `content-type: text/markdown`, `vary: Accept`.
4. `curl -s https://<domain>/.well-known/ai-catalog.json | jq .` — valid JSON.
5. `curl -s https://<domain>/.well-known/api-catalog | jq .` — valid linkset.
6. `curl -s -o /dev/null -w "%{http_code}" https://<domain>/definitely-not-a-page` — returns **404**, not 200.
7. `curl -s https://<domain>/key-page | grep "<h1"` — exactly one H1, in the raw HTML.
8. Compare new score vs. baseline recorded in Step 2 and summarize the delta for the user.

## Files in this skill

- `scripts/audit.mjs` — runs the is-agentic CLI (REST API fallback) and prints a prioritized report of passed/failed checks with action items.
- `scripts/generate-llms-txt.mjs` — scaffolds `llms.txt` (optionally tailored per framework: nextjs, astro, hugo, generic).
