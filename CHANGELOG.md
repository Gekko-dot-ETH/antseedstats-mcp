# Changelog

## 0.5.0 (2026-10-10)

- `antseedstats_usage` (site 2.12.0): API calls per UTC day and client family, and the most called endpoints.
- `antseedstats_ask` (site 2.13.0): ask any question in plain language and get one answer with sources. It is
  **paid**: $0.03 in USDC on Base per answer through x402, signed with `X402_PRIVATE_KEY` from your own env
  (stdio only; the hosted server never pays and explains how to enable it instead). No ETH needed.
- `antseedstats_network_summary` gains `modality_7d` (text, images and video over the last 7 days).

## 0.4.0 (2026-10-09)

- Catalogue synced with site 2.11.3: images and video (settlement metadata v4, since 8 October 2026) in
  `antseedstats_network_daily` (images, video seconds, videos and their spend per UTC day),
  `antseedstats_network_summary` (`generative_7d`, the last 7 days of images and video), `antseedstats_models`,
  `antseedstats_models_detail` and `antseedstats_requests` (video seconds and videos). Additive only.
- README: the "Server disconnected" fix for desktop apps (they start `npx` without your shell's PATH, so node from
  nvm, Volta, asdf or Homebrew is not found).

## 0.3.0 (2026-10-09)

- Seventeen new tools from site 2.10 (every page now has a twin): `antseedstats_buyers`, `buyers_detail`,
  `buyers_daily`, `staking_pools`, `staking_positions`, `rewards_current`, `rewards_pools`, `diem`, `channels`,
  `channels_detail`, `requests`, `transactions`, `labs`, `labs_detail`, `distribution`, `ants_holders` and
  `registry` (the on-chain wash registry only; clusters stay a flag). Thirty-five tools in all.
- Tests and `scripts/deploy.sh` default `MCP_TEST_API` to `https://antseedstats.com`, so the live tests run
  against prod instead of being silently skipped when nothing listens on the dev box's 3199.

## 0.2.0 (2026-10-08)

- Four new tools from site 2.9: `antseedstats_search` (names to ids), `antseedstats_estimate` (the calculator),
  `antseedstats_glossary` (every definition behind the tips) and `antseedstats_changelog`. `models_detail` and
  `prices` take the intent filters (trusted, verified, organic, live, min_reputation, price caps, sort); decimal
  parameters are accepted as numbers or strings.
- Every tool declares an `outputSchema` built from the API's response schema and returns `structuredContent`
  (`{ data, meta }`) next to the text; `meta.docs` carries the endpoint docs, the page and the glossary link.
- Resources: `antseedstats://llms.txt`, `llms-full.txt`, `glossary`, `faq`, `openapi.json`, `changelog`.
- Prompts: `compare_sellers_for_model`, `audit_seller`, `weekly_network_report`.

## 0.1.2 (2026-10-08)

- The data licence travels with every answer: the result footer and the server instructions state CC BY 4.0
  with attribution to AntSeedStats (antseedstats.com), and point at the site's front door for agents,
  https://antseedstats.com/llms.txt. README links llms.txt and the For agents page.

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
