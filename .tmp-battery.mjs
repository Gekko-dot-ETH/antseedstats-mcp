// Paid battery against prod with the test wallet (key read from ~/.config, never printed).
import { readFileSync } from "node:fs";
import { wrapFetchWithPaymentFromConfig, decodePaymentResponseHeader } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm";
import { privateKeyToAccount } from "viem/accounts";
const w = JSON.parse(readFileSync(process.env.HOME + "/.config/antseedstats/x402-test-wallet.json", "utf8"));
const pay = wrapFetchWithPaymentFromConfig(fetch, { schemes: [{ network: "eip155:8453", client: new ExactEvmScheme(privateKeyToAccount(w.privateKey)) }] });
const URL_ = "https://antseedstats.com/api/v1/ask";
async function ask(question, raw) {
  const t = Date.now();
  const r = await pay(URL_, { method: "POST", headers: { "content-type": "application/json" }, body: raw ?? JSON.stringify({ question }) });
  const body = await r.json().catch(() => ({}));
  const h = r.headers.get("PAYMENT-RESPONSE");
  let tx = null; if (h) { try { tx = decodePaymentResponseHeader(h).transaction; } catch {} }
  return { q: question ?? raw.slice(0, 40), status: r.status, s: ((Date.now() - t) / 1000).toFixed(1), model: body.data?.model, cached: body.data?.cached, tools: (body.data?.citations ?? []).map((c) => c.tool).join(","), answer: body.data?.answer ?? body.error?.message, tx };
}
const out = [];
out.push(...await Promise.all([ask("Which staking pool has the most ANTS staked?"), ask("What is the current epoch's $ANTS emission?")]));
out.push(await ask("x".repeat(501)));
out.push(await ask(undefined, "{not json"));
for (const o of out) console.log(JSON.stringify(o));
