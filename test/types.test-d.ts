/**
 * Type-level assertions for `@anaxer/sdk` (doc 22 §4.8 / §D / review R2).
 *
 * Enforced by `npm run typecheck -w @anaxer/sdk` — `tsconfig.json` includes `test/`,
 * so unused `@ts-expect-error` directives and assignability failures fail that script.
 * Not executed by vitest (`.test-d.ts` is compile-only).
 */
import {
  connect,
  type CreatedV1,
  type CreationsFilters,
  type GraduationsFilters,
  type PriceUpdateV1,
  type PricesFilters,
  type Subscription,
  type SubscriptionFiltersV1,
  type SwapV1,
  type TradesFilters,
  type TransferV1,
  type TransfersFilters,
  type ConnectionLimits,
  type Page,
} from "../src/index";

const client = connect({ apiKey: process.env.ANAXER_API_KEY! });

// ---- channel → payload narrowing ----
const creationsSub: Subscription<CreatedV1> = client.stream("creations");
const pricesSub: Subscription<PriceUpdateV1> = client.stream("prices");
const tradesSub: Subscription<SwapV1> = client.stream("trades");
const transfersSub: Subscription<TransferV1> = client.stream("transfers", {
  wallets: ["BniJiqBxKyu31cCJwno3ui9XiPo1Qno6eJoqmqXbntL1"],
  direction: "in",
  minVolumeUsd: 10,
});
void creationsSub;
void pricesSub;
void tradesSub;
void transfersSub;

// ---- negative: volume filters on non-trades ----
// @ts-expect-error volume filters are only valid on trades
client.stream("prices", { minVolumeUsd: 10 });

// @ts-expect-error volume filters are only valid on trades
client.stream("creations", { maxVolumeUsd: 100 });

// ---- negative: transfers have no source; direction is transfers-only ----
// @ts-expect-error sources is not a transfers filter (transfers carry no source)
client.stream("transfers", { sources: ["pump_fun"] });

// @ts-expect-error direction is only valid on transfers
client.stream("trades", { direction: "in" });

// @ts-expect-error solOnly is trades-only
client.stream("transfers", { solOnly: true });

// ---- negative: REST source and sources are exclusive ----
// @ts-expect-error pass source or sources, not both
void client.creations({ source: "pump_fun", sources: ["pump_amm"] });

// ---- REST wallets namespace ----
async function walletReads(): Promise<void> {
  const trades: Page<SwapV1> = await client.wallets.trades("Wallet", {
    sources: ["pump_fun", "pump_amm"],
    mints: ["Mint11111111111111111111111111111111"],
    minVolumeUsd: 100,
  });
  const transfers: Page<TransferV1> = await client.wallets.transfers("Wallet", {
    direction: "out",
    mints: ["So11111111111111111111111111111111111111112"],
  });
  const symbol: string | null = trades.data[0]!.swap.from.symbol;
  const transferSymbol: string | null = transfers.data[0]!.transfer.symbol;
  void symbol;
  void transferSymbol;
  // @ts-expect-error transfers have no sources filter
  await client.wallets.transfers("Wallet", { sources: ["pump_fun"] });
}
void walletReads;

// ---- connected limits: transfers fields are optional (old gateways omit them) ----
const oldShapeLimits: ConnectionLimits = {
  connectionsPerStream: 1,
  tradesRequiresMints: true,
  tradesMintCap: 10,
};
void oldShapeLimits;

// ---- *Filters assignable to SubscriptionFiltersV1 (§3a Q3) ----
const tradesFilters: TradesFilters = {
  sources: ["pump_fun"],
  minVolumeUsd: 1,
  solOnly: true,
};
const creationsFilters: CreationsFilters = {
  enriched: true,
  excludeMayhem: true,
};
const graduationsFilters: GraduationsFilters = {
  excludeMayhem: true,
  minLiquiditySol: 10,
};
const pricesFilters: PricesFilters = {
  sources: ["pump_fun"],
  mints: ["Mint11111111111111111111111111111111"],
};
const transfersFilters: TransfersFilters = {
  mints: ["Mint11111111111111111111111111111111"],
  maxVolumeUsd: 1000,
};

const _a: SubscriptionFiltersV1 = tradesFilters;
const _b: SubscriptionFiltersV1 = creationsFilters;
const _c: SubscriptionFiltersV1 = graduationsFilters;
const _d: SubscriptionFiltersV1 = pricesFilters;
const _e: SubscriptionFiltersV1 = transfersFilters;
void _e;
void _a;
void _b;
void _c;
void _d;

// ---- advertised site snippet compiles verbatim (doc 22 §1) ----
async function siteSnippet(): Promise<void> {
  const c = connect({ apiKey: process.env.ANAXER_API_KEY! });

  c.stream("creations", { excludeMayhem: true }).on("data", (token) => {
    console.log("new launch:", token.symbol, token.mint);
  });

  const price = await c.tokens.price("3PFaeFMXiRVYueDCnHHSKndKDDpKZhbhFjQ13JXYpump");
  void price;
}

void siteSnippet;
