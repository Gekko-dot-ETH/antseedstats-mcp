# @antseedstats/mcp-server

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

MCP server for [AntSeedStats](https://antseedstats.com), the independent stats layer for **AntSeed**, a
peer-to-peer AI-inference marketplace on Base. One tool per public API endpoint, generated from the same
catalogue that drives [antseedstats.com/developers](https://antseedstats.com/developers) and the
[OpenAPI file](https://antseedstats.com/api/v1/openapi.json), so the tools cannot lag the API.

Ask your AI client things like *"Where can I buy kimi-k3 on AntSeed, cheapest trusted seller first?"*,
*"How much did seller 0x… settle per day last week?"* or *"What is the projected $ANTS per USD this epoch?"*.

## Quick start

### Hosted (no install)

The server runs at `https://antseedstats.com/mcp` (Streamable HTTP, stateless, no auth).

```bash
# Claude Code
claude mcp add --transport http antseedstats https://antseedstats.com/mcp
```

Claude Desktop has no remote URL field yet; bridge it with `mcp-remote` in `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "antseedstats": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://antseedstats.com/mcp"]
    }
  }
}
```

### Local (stdio)

```json
{
  "mcpServers": {
    "antseedstats": {
      "command": "npx",
      "args": ["-y", "@antseedstats/mcp-server"]
    }
  }
}
```

The same block works in Cursor (`.cursor/mcp.json`). VS Code wraps it as `"mcp": { "servers": { … } }`
(`.vscode/mcp.json`). The local server calls the public API at `https://antseedstats.com`.

### Self-hosted HTTP

```bash
npx @antseedstats/mcp-server --http            # 127.0.0.1:3200/mcp and /health
PORT=4000 ANTSEEDSTATS_API_URL=http://127.0.0.1:3199 npx @antseedstats/mcp-server --http
```

## Tools (35)

| Tool | What it answers |
|------|-----------------|
| `antseedstats_network_summary` | Lifetime totals, rolling 24h/7d/30d windows, current epoch |
| `antseedstats_network_daily` | Per UTC day: settled, users, tokens, free usage |
| `antseedstats_leaders` | Last 24h leaders (seller, model by sales, by tokens, free), wash left out |
| `antseedstats_sellers` | Every seller with lifetime and 7-day figures, trust score, wash flag |
| `antseedstats_sellers_detail` | One seller: totals, trust parts, verification, stake |
| `antseedstats_sellers_daily` | One seller per UTC day (the cross-check against its own ledger) |
| `antseedstats_sellers_models` | What a seller advertises (signed prices) and what it sold |
| `antseedstats_models` | Model catalogue: sellers, min and max prices, usage |
| `antseedstats_models_detail` | Where to buy one model, trusted first, with intent filters (trusted, verified, organic, live, price caps) |
| `antseedstats_prices` | Every listing with the OpenRouter list price and the saving, with the same intent filters |
| `antseedstats_epochs` | Every epoch: emission, seller and buyer points, burn |
| `antseedstats_epochs_detail` | One epoch; live budgets, usage and projected burn when current |
| `antseedstats_ants_supply` | $ANTS minted, emitted, burned, staked (canonical token address) |
| `antseedstats_search` | Names to ids: a seller name, a model in any spelling, a lab, a 0x address or hash |
| `antseedstats_estimate` | Cost of a monthly token mix on AntSeed vs the list price: cheapest, trusted pick, saving |
| `antseedstats_glossary` | Every definition behind the site's info dots, by page or by search |
| `antseedstats_changelog` | What changed on the site and the API, newest first |
| `antseedstats_distribution` | Who the volume concentrates on: top buyers and sellers, HHI, Gini, Lorenz curve |
| `antseedstats_registry` | AntSeed's on-chain wash registry (the chain's list; our clusters are only ever a flag) |
| `antseedstats_buyers` | Every buyer with lifetime spend, tokens, requests, plus the escrow totals |
| `antseedstats_buyers_detail` | One buyer: spend, the sellers it paid, the models it bought, free-tier usage |
| `antseedstats_buyers_daily` | One buyer's spend per UTC day |
| `antseedstats_labs` | The labs behind the models, with model counts |
| `antseedstats_labs_detail` | One lab: profile, links and its models on AntSeed with cheapest prices |
| `antseedstats_staking_pools` | Every provider pool: stake, power, usage points, reward, APY estimate |
| `antseedstats_staking_positions` | Every lANTS position: owner, pool, principal, power, lock, state |
| `antseedstats_rewards_current` | This epoch's budgets and the top earners with projected $ANTS |
| `antseedstats_rewards_pools` | The pools bucket cut, locked rewards, USDC stake and claims |
| `antseedstats_diem` | The DIEM pool: stake, USDC paid, APY estimate, top stakers, staked series |
| `antseedstats_ants_holders` | $ANTS holders by balance, with labels for protocol contracts |
| `antseedstats_channels` | Payment channel lifecycle counts and the most recently active channels |
| `antseedstats_channels_detail` | One channel: pair, settled, per-model split, last settlements |
| `antseedstats_requests` | The live requests feed (per-event usage reports) and the rolling 24h band |
| `antseedstats_transactions` | Latest on-chain activity across every AntSeed contract, by kind |
| `antseedstats_status` | Indexer head, lag and subsystems |

Every result starts with a provenance line (the page on antseedstats.com, the Base block it is as of, and
whether each figure is a **chain** fact, a seller's own **announce**ment or **antseedstats**' judgement), then the
API's `data` as JSON, then a one-line attribution. Field names and units are the API's:
[antseedstats.com/developers](https://antseedstats.com/developers).

Lists return 20 rows by default and at most 100 (`limit`); the REST API goes to 1000.

Every tool declares an `outputSchema` (the API's own response schema) and returns `structuredContent`
(`{ data, meta }`) next to the text, so clients that read typed results need no parsing.

## Resources (6)

The site's backstage, readable from inside the client: `antseedstats://llms.txt` (the front door),
`antseedstats://llms-full.txt` (everything in one file), `antseedstats://glossary`, `antseedstats://faq`,
`antseedstats://openapi.json`, `antseedstats://changelog`. One GET each, cached five minutes.

## Prompts (3)

Recipes that chain the tools in the right order: `compare_sellers_for_model` (model, token mix),
`audit_seller` (address or name), `weekly_network_report`.

## Configuration

| Variable | Default | Meaning |
|----------|---------|---------|
| `ANTSEEDSTATS_API_URL` | `https://antseedstats.com` | REST API origin (`--api <url>` also works) |
| `PORT` | `3200` | HTTP mode port (`--port <n>` also works); binds 127.0.0.1 |
| `TRUST_PROXY` | unset | HTTP mode behind nginx: trust `X-Real-IP` / `X-Forwarded-For` and forward them to the API |
| `MCP_RATE_LIMIT_PER_MIN` | `60` | HTTP mode budget per client IP (the API has its own 60/min per IP) |

## Development

```bash
npm install
npm run sync-catalog   # regenerate src/generated/catalog.ts from ../antseed-stats (ANTSEEDSTATS_REPO to point elsewhere)
npm run check-drift    # compare the generated catalogue with the live openapi.json
npm test               # unit tests, plus live stdio and HTTP tests when MCP_TEST_API (default http://127.0.0.1:3199) answers
npm run build
```

## Links

- [AntSeedStats](https://antseedstats.com) · [Developers](https://antseedstats.com/developers) · [OpenAPI](https://antseedstats.com/api/v1/openapi.json) · [llms.txt](https://antseedstats.com/llms.txt) · [For agents](https://antseedstats.com/for-agents)
- [AntSeed](https://antseed.com), the marketplace
- Built by [gekko.eth](https://x.com/gekko_eth)

## License

The code is [MIT](LICENSE). The data the tools return is published by AntSeedStats under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/): free to use with attribution to AntSeedStats (antseedstats.com).
