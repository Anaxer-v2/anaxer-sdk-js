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
} from "../src/index";

const client = connect({ apiKey: process.env.ANAXER_API_KEY! });

// ---- channel → payload narrowing ----
const creationsSub: Subscription<CreatedV1> = client.stream("creations");
const pricesSub: Subscription<PriceUpdateV1> = client.stream("prices");
const tradesSub: Subscription<SwapV1> = client.stream("trades");
void creationsSub;
void pricesSub;
void tradesSub;

// ---- negative: volume filters on non-trades ----
// @ts-expect-error volume filters are only valid on trades
client.stream("prices", { minVolumeUsd: 10 });

// @ts-expect-error volume filters are only valid on trades
client.stream("creations", { maxVolumeUsd: 100 });

// ---- negative: transfers omitted in v1 (§3a Q1) ----
// @ts-expect-error transfers overload is not in the v1 SDK surface
client.stream("transfers", {
  wallets: ["BniJiqBxKyu31cCJwno3ui9XiPo1Qno6eJoqmqXbntL1"],
});

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

const _a: SubscriptionFiltersV1 = tradesFilters;
const _b: SubscriptionFiltersV1 = creationsFilters;
const _c: SubscriptionFiltersV1 = graduationsFilters;
const _d: SubscriptionFiltersV1 = pricesFilters;
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
