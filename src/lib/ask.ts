// antseedstats_ask: the site's paid question endpoint (POST /api/v1/ask, x402, USDC on Base) as an MCP tool.
// Today's Claude, Cursor and VS Code clients hold no wallet and do not speak x402, so the server pays on the user's
// behalf with a key from the user's OWN environment (X402_PRIVATE_KEY, stdio mode only). Without a key, or on the
// hosted server, the tool explains the price and how to enable it instead of paying. The key never leaves this
// process: @x402/fetch signs an EIP-3009 USDC authorisation for the exact price, and the facilitator submits it.
import type { Config } from "../config.js";
import { USER_AGENT } from "../config.js";

export const ASK_TOOL = "antseedstats_ask";

export type AskResult = { ok: boolean; text: string; data?: unknown };

type Terms = { price?: { usd?: number; network_name?: string; pay_to?: string }; policy?: string[]; docs?: string };

async function terms(cfg: Config): Promise<Terms | null> {
  try {
    const r = await fetch(`${cfg.apiUrl}/api/v1/ask`, { headers: { "User-Agent": USER_AGENT } });
    return r.ok ? ((await r.json()) as { data: Terms }).data : null;
  } catch { return null; }
}

function howTo(t: Terms | null, hosted: boolean): string {
  const price = t?.price?.usd ? `$${t.price.usd}` : "a few cents";
  return [
    `antseedstats_ask is paid: ${price} in USDC on Base per answer, through x402 (no ETH needed, you pay only for a successful answer).`,
    hosted
      ? "The hosted server never pays. Run the server locally (npx -y @antseedstats/mcp-server) with X402_PRIVATE_KEY set to a Base wallet that holds a little USDC."
      : "To enable it, set X402_PRIVATE_KEY in this MCP server's env to the private key of a Base wallet that holds a little USDC (use a dedicated wallet).",
    "Every other tool here is free and answers the same questions step by step.",
    `Terms: ${t?.docs ?? "https://antseedstats.com/developers#ask"}`,
  ].join("\n");
}

export async function askPaid(cfg: Config, question: string, hosted: boolean): Promise<AskResult> {
  if (!cfg.payKey) return { ok: false, text: howTo(await terms(cfg), hosted) };
  const [{ wrapFetchWithPaymentFromConfig, decodePaymentResponseHeader }, { ExactEvmScheme }, { privateKeyToAccount }] = await Promise.all([
    import("@x402/fetch"), import("@x402/evm"), import("viem/accounts"),
  ]);
  const pay = wrapFetchWithPaymentFromConfig(fetch, {
    schemes: [{ network: "eip155:8453", client: new ExactEvmScheme(privateKeyToAccount(cfg.payKey)) }],
  });
  const res = await pay(`${cfg.apiUrl}/api/v1/ask`, {
    method: "POST",
    headers: { "content-type": "application/json", "User-Agent": USER_AGENT },
    body: JSON.stringify({ question }),
  });
  const body = (await res.json().catch(() => ({}))) as { data?: { answer?: string; citations?: Array<{ page?: string | null }>; model?: string; cached?: boolean }; error?: { message?: string } };
  if (!res.ok || !body.data) return { ok: false, text: body.error?.message ?? `HTTP ${res.status}` };
  let tx = "";
  const header = res.headers.get("PAYMENT-RESPONSE") ?? res.headers.get("X-PAYMENT-RESPONSE");
  if (header) {
    try { tx = (decodePaymentResponseHeader(header) as { transaction?: string }).transaction ?? ""; } catch { /* no receipt */ }
  }
  const pages = [...new Set((body.data.citations ?? []).map((c) => c.page).filter(Boolean))];
  const text = [
    body.data.answer ?? "",
    pages.length ? `\nSources: ${pages.join(" · ")}` : "",
    `\nPaid with x402${tx ? ` (tx ${tx})` : ""}${body.data.cached ? ", cached answer" : ""}; answered by ${body.data.model ?? "the engine"}. Data: AntSeedStats (antseedstats.com), CC BY 4.0.`,
  ].join("");
  return { ok: true, text, data: body.data };
}
