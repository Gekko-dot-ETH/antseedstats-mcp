// MCP prompts: the questions people actually bring, as a recipe that chains the tools in the right order. A
// prompt is text the client puts in front of the model; it names the tools by their real names so the chain
// holds (tests pin that every tool a prompt names exists in the catalogue).
export type PromptArg = { name: string; description: string; required?: boolean };
export type PromptDef = { name: string; title: string; description: string; args: PromptArg[]; build: (args: Record<string, string | undefined>) => string };

const ADDRESS_NOTE = "Addresses are lowercase 0x; model ids are the canonical slugs antseedstats_search returns.";

export const PROMPTS: PromptDef[] = [
  {
    name: "compare_sellers_for_model",
    title: "Compare sellers for a model",
    description: "Where to buy a model on AntSeed: resolve the name, list the sellers that meet a buyer's conditions, price a workload, cite the pages.",
    args: [
      { name: "model", description: "Model name in any spelling (Kimi K3, claude-opus-4-6, gpt-5.6)", required: true },
      { name: "input_tokens", description: "Monthly input tokens (default 22000000)" },
      { name: "output_tokens", description: "Monthly output tokens (default 5500000)" },
    ],
    build: (a) => [
      `Compare the sellers of "${a.model}" on AntSeed for a buyer who wants a reliable, cheap option.`,
      `1. Call antseedstats_search with q="${a.model}" and type="model" to get the canonical id (take the top match; say so if the match is weak).`,
      `2. Call antseedstats_models_detail with that id and trusted=true, then again without filters. Trusted means proven on-chain with a trust score of 60 or more; organic=false rows are wash-flagged.`,
      `3. Call antseedstats_estimate with the id, input_tokens=${a.input_tokens ?? 22000000} and output_tokens=${a.output_tokens ?? 5500000} for the list price, the cheapest seller, the trusted pick and the saving.`,
      `4. Answer with: the trusted pick (seller, prices, monthly cost), the cheapest untrusted alternative and why it is riskier, the saving against the list price, and the page links from the results. State the Base block the figures are as of. ${ADDRESS_NOTE}`,
    ].join("\n"),
  },
  {
    name: "audit_seller",
    title: "Audit a seller",
    description: "A seller's standing in one pass: totals, trust score and its parts, verification, wash flag, last week's volume, what it sells.",
    args: [{ name: "seller", description: "Seller address (0x) or announced name", required: true }],
    build: (a) => [
      `Audit the AntSeed seller "${a.seller}".`,
      `1. If it is not a 0x address, call antseedstats_search with q="${a.seller}" and type="seller" to get the address.`,
      `2. Call antseedstats_sellers_detail (totals, rank, trust parts, verification, wash_registry, organic), antseedstats_sellers_daily for the last 14 days, and antseedstats_sellers_models (what it advertises and what sold).`,
      `3. Report: lifetime and 7-day settled USDC and the trend, buyers and settles, the trust score with its history/usage/power/identity parts, whether a domain or GitHub proof is verified, whether the on-chain wash registry (a chain fact) or our organic view (our judgement) flags it, and the models that actually sell. Separate chain facts from our judgement. Cite the seller page and the Base block. ${ADDRESS_NOTE}`,
    ].join("\n"),
  },
  {
    name: "weekly_network_report",
    title: "Weekly network report",
    description: "The last seven days of the AntSeed marketplace: volume, buyers and sellers, leaders, the epoch, what moved.",
    args: [],
    build: () => [
      "Write a short weekly report on the AntSeed marketplace from AntSeedStats data.",
      "1. Call antseedstats_network_summary (lifetime, 24h/7d/30d windows, the epoch and when it ends) and antseedstats_network_daily for the last 14 days (compare this week with the one before).",
      "2. Call antseedstats_leaders (last 24h leaders), antseedstats_sellers with sort=revenue_7d and view=organic and limit=10, and antseedstats_models with view=organic and limit=10.",
      "3. Call antseedstats_epochs_detail for the current epoch (budgets, usage, projected burn) and antseedstats_changelog with limit=5 for what changed on the site.",
      "4. Report in this order: settled USDC this week vs last (and the 4% fee), active buyers and sellers, the top sellers and models (organic view, so wash traders are out), the epoch status and what rolls when it ends, anything notable in the daily series. Every figure with its unit; name the Base block the data is as of; link the pages the results name. Do not invent a $ANTS price: it has none.",
    ].join("\n"),
  },
];

/** Every tool name a prompt mentions, for the test that pins them to the catalogue. */
export function toolsNamedIn(p: PromptDef): string[] {
  const text = p.build(Object.fromEntries(p.args.map((a) => [a.name, "x"])));
  return [...new Set([...text.matchAll(/antseedstats_[a-z0-9_]+/g)].map((m) => m[0]))];
}
