// Runtime configuration. Everything an operator may want to change comes from the environment or the CLI;
// the defaults point at the public site, so `npx @antseedstats/mcp-server` works with no setup.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(here, "../package.json"), "utf8")) as { name: string; version: string };

export const SITE_URL = "https://antseedstats.com";

export type Config = {
  /** MCP server name as announced to clients. */
  name: string;
  version: string;
  /** Origin of the REST API (no trailing slash). The hosted server points this at the local Next process. */
  apiUrl: string;
  /** Where deep links go (always the public site, even when apiUrl is localhost). */
  siteUrl: string;
  timeoutMs: number;
  /** Retries after a 5xx or a network error (not after a 4xx). */
  retries: number;
  /** HTTP mode: trust X-Real-IP / X-Forwarded-For from the reverse proxy. Only behind nginx. */
  trustProxy: boolean;
  /** HTTP mode: requests per IP per rolling minute at the MCP layer. */
  rateLimitPerMin: number;
  port: number;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env, argv: string[] = process.argv.slice(2)): Config {
  const flag = (name: string): string | undefined => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return {
    name: "antseedstats",
    version: pkg.version,
    apiUrl: (flag("--api") ?? env.ANTSEEDSTATS_API_URL ?? SITE_URL).replace(/\/+$/, ""),
    siteUrl: SITE_URL,
    timeoutMs: Number(env.ANTSEEDSTATS_TIMEOUT_MS ?? 15_000),
    retries: 1,
    trustProxy: env.TRUST_PROXY === "1" || env.TRUST_PROXY === "true",
    rateLimitPerMin: Number(env.MCP_RATE_LIMIT_PER_MIN ?? 60),
    port: Number(flag("--port") ?? env.PORT ?? 3200),
  };
}

export const USER_AGENT = `AntSeedStats-MCP/${pkg.version} (node ${process.versions.node})`;

/** Shown to clients that honour it (Claude Desktop does not; the tool descriptions repeat what matters). */
export const INSTRUCTIONS = `These tools read AntSeedStats (${SITE_URL}), the independent stats layer for AntSeed, a peer-to-peer AI-inference marketplace on Base where sellers run models and buyers pay in USDC through payment channels; $ANTS is the network token.
Every result starts with a line naming the page on antseedstats.com it comes from and the Base block it is as of: cite that page in your answer. Figures labelled chain are on-chain facts; announce is what a seller publishes about itself (names, prices) taken as is; antseedstats is our own judgement (organic view, trust score, projections). Settled volume is what changed hands on-chain, which can differ from what a seller measured at home. $ANTS has no market price: never invent one. No financial advice. The data is licensed CC BY 4.0: free to use with attribution to AntSeedStats (antseedstats.com). The site's front door for agents, with every definition, is https://antseedstats.com/llms.txt.`;
