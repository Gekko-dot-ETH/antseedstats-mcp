# Changelog

## 0.1.1 (2026-10-08)

- HTTP: a JSON-RPC batch costs one unit of the per-IP budget per message and is capped at 10 messages per
  request, so one POST cannot fan out into many API calls.
- HTTP: `/health` runs one API check at a time and remembers a good answer for 30 s (a bad one for 5 s).
- HTTP: malformed JSON, oversized bodies and other client errors answer as JSON-RPC errors with their own
  status (-32700, 413, 4xx) instead of Express's HTML page; a refused batch is not charged to the budget.

## 0.1.0 (2026-10-08)

- First release. 14 tools, one per endpoint of the AntSeedStats public API v1, generated from the API's own
  catalogue (`npm run sync-catalog`, `npm run check-drift`).
- stdio by default; `--http` serves stateless Streamable HTTP on `/mcp` with `/health`.
- Every result carries the page on antseedstats.com, the Base block it is as of, and the source label of each
  figure (chain, announce, antseedstats).
- HTTP mode forwards the client IP to the API so per-IP budgets apply to the person asking, and limits 60
  requests per minute per IP itself.
