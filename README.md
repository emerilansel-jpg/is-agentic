# is-agentic

Audit and optimize websites for **AI agents, synthetic clients, and LLM web crawlers** using [is-agentic.com](https://is-agentic.com) standards and CLI.

This repository is a [Claude Code / ZCode-compatible skill](https://docs.anthropic.com/en/docs/claude-code/skills) — install it, then invoke `/is-agentic` in your agent session.

## What it does

The next wave of web traffic is not human: LLMs answering questions, synthetic shoppers, research bots, and autonomous agents consume the web without browsers or JavaScript patience. A site can ace Lighthouse and still be invisible to agents.

This skill gives your AI coding agent a complete workflow to:

1. **Audit** a domain with `npx is-agentic <domain> --json` (or the REST API at `https://is-agentic.com/api/v1/report`).
2. **Interpret** the score, failing Essential checks, Recommended checks, and the agent journey trace.
3. **Fix** the site with concrete, copy-pasteable recipes:
   - `llms.txt` / `llms-full.txt` ([llmstxt.org](https://llmstxt.org))
   - Content negotiation: `Accept: text/markdown` → markdown, with `Vary: Accept` (Next.js, Cloudflare Workers, Express)
   - Machine catalogs: `/.well-known/ai-catalog.json` and RFC 9727 `/.well-known/api-catalog`
   - Semantic HTML, SSR requirements, discovery metadata (canonical, Open Graph, `html lang`)
   - Recoverable HTTP error states for automated crawlers
4. **Re-audit** and verify the score improved.

## Install

```bash
# ZCode
cp -r . ~/.zcode/skills/is-agentic

# Claude Code / agents
cp -r . ~/.agents/skills/is-agentic
```

Or clone straight into your skills directory:

```bash
git clone https://github.com/emerilansel-jpg/is-agentic ~/.agents/skills/is-agentic
```

## Usage

Inside an agent session:

```
/is-agentic audit example.com
/is-agentic make mysite.com agent-ready
```

Standalone scripts (no agent needed):

```bash
# Full audit with prioritized action items (CLI with REST API fallback)
node scripts/audit.mjs example.com

# Raw JSON report
node scripts/audit.mjs example.com --json

# Scaffold an llms.txt
node scripts/generate-llms-txt.mjs --name "My Site" --domain mysite.com \
  --framework nextjs --out ./public/llms.txt --full
```

Requires Node.js 18+ (uses global `fetch`). The audit script shells out to `npx is-agentic`; if that's unavailable it falls back to the public REST API automatically.

## Repository layout

```
SKILL.md                          # The skill: audit workflow + 5 optimization recipes
scripts/audit.mjs                 # Audit runner + prioritized report formatter
scripts/generate-llms-txt.mjs     # llms.txt / llms-full.txt scaffolder
```

## References

- [is-agentic.com](https://is-agentic.com) — evaluator · [OpenAPI schema](https://is-agentic.com/openapi.json) · [MCP server](https://is-agentic.com/mcp)
- [llms.txt specification](https://llmstxt.org)
- [RFC 9727 — API Catalog](https://www.rfc-editor.org/rfc/rfc9727.html)
- [RFC 9264 — Linkset](https://www.rfc-editor.org/rfc/rfc9264.html)

## License

MIT — see [LICENSE](LICENSE).
