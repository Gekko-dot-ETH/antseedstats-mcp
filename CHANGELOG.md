# Changelog

## 0.1.0 (2026-10-08)

- First release. 14 tools, one per endpoint of the AntSeedStats public API v1, generated from the API's own
  catalogue (`npm run sync-catalog`, `npm run check-drift`).
- stdio by default; `--http` serves stateless Streamable HTTP on `/mcp` with `/health`.
- Every result carries the page on antseedstats.com, the Base block it is as of, and the source label of each
  figure (chain, announce, antseedstats).
- HTTP mode forwards the client IP to the API so per-IP budgets apply to the person asking, and limits 60
  requests per minute per IP itself.
