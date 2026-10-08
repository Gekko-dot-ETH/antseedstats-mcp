# Changelog

## 0.1.1 (2026-10-08)

- HTTP: a JSON-RPC batch costs one unit of the per-IP budget per message and is capped at 10 messages per
  request, so one POST cannot fan out into many API calls.
- HTTP: `/health` runs one API check at a time and remembers a good answer for 30 s (a bad one for 5 s).
- HTTP: malformed JSON, oversized bodies and other client errors answer as JSON-RPC errors with their own
  status (-32700, 413, 4xx) instead of Express's HTML page; a refused batch is not charged to the budget.
- HTTP: the per-IP charge happens before the body is parsed; behind the proxy the client IP is X-Real-IP or
  the last X-Forwarded-For hop (never the first, which the client controls); `MCP_RATE_LIMIT_PER_MIN=0` turns
  the limiter off; a listen error (port taken) ends the process through the fatal path.
- Tools: numeric and boolean arguments sent as strings ("10", "true") are accepted, as the REST API accepts them.
- Tooling: `check-drift` compares parameter schemas (types, enums, bounds) and tool names, not just names;
  `sync-catalog` output carries no timestamp, so an unchanged catalogue produces no diff; `deploy.sh` aborts
  when the remote install fails instead of reloading pm2 onto it.

## 0.1.0 (2026-10-08)

- First release. 14 tools, one per endpoint of the AntSeedStats public API v1, generated from the API's own
  catalogue (`npm run sync-catalog`, `npm run check-drift`).
- stdio by default; `--http` serves stateless Streamable HTTP on `/mcp` with `/health`.
- Every result carries the page on antseedstats.com, the Base block it is as of, and the source label of each
  figure (chain, announce, antseedstats).
- HTTP mode forwards the client IP to the API so per-IP budgets apply to the person asking, and limits 60
  requests per minute per IP itself.
