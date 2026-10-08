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

## Tools (14)

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
| `antseedstats_models_detail` | Where to buy one model, cheapest first, with reputation and organic flags |
| `antseedstats_prices` | Every listing with the OpenRouter list price and the saving |
| `antseedstats_epochs` | Every epoch: emission, seller and buyer points, burn |
| `antseedstats_epochs_detail` | One epoch; live budgets, usage and projected burn when current |
| `antseedstats_ants_supply` | $ANTS minted, emitted, burned, staked (canonical token address) |
| `antseedstats_status` | Indexer head, lag and subsystems |

Every result starts with a provenance line (the page on antseedstats.com, the Base block it is as of, and
whether each figure is a **chain** fact, a seller's own **announce**ment or **antseedstats**' judgement), then the
API's `data` as JSON, then a one-line attribution. Field names and units are the API's:
[antseedstats.com/developers](https://antseedstats.com/developers).

Lists return 20 rows by default and at most 100 (`limit`); the REST API goes to 1000.

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

- [AntSeedStats](https://antseedstats.com) · [Developers](https://antseedstats.com/developers) · [OpenAPI](https://antseedstats.com/api/v1/openapi.json)
- [AntSeed](https://antseed.com), the marketplace
- Built by [gekko.eth](https://x.com/gekko_eth)

## License

[MIT](LICENSE)
