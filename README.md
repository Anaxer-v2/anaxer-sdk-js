# `@anaxer/sdk`

Official TypeScript client for the Anaxer Solana real-time data API — typed WebSocket
streams and REST reads over the public `/v1` contracts.

**Requires Node ≥ 20.** ESM and CommonJS builds ship together.

```bash
npm install @anaxer/sdk
```

## Quickstart

```ts
import { connect } from "@anaxer/sdk";

const client = connect({ apiKey: process.env.ANAXER_API_KEY! });

client.stream("creations", { excludeMayhem: true }).on("data", (token) => {
  console.log("new launch:", token.symbol, token.mint);
});

const price = await client.tokens.price("3PFaeFMXiRVYueDCnHHSKndKDDpKZhbhFjQ13JXYpump");
```

`connect()` returns immediately. The WebSocket opens on the first `stream()` call (or
`await client.ready()`). Auth is `Authorization: Bearer` for both WS and REST.

Wire contracts: [WebSocket streams](https://anaxer.com/docs/streams) and
[REST API](https://anaxer.com/docs/rest). Changes: [changelog](https://anaxer.com/docs/changelog).

## Streaming (`client.stream`)

| Channel | Payload type | Filters |
|---|---|---|
| `trades` | `SwapV1` | `sources`, `mints`, `wallets` (≤ 100), `minVolumeUsd` / `maxVolumeUsd`, `solOnly` |
| `transfers` | `TransferV1` | `wallets`, `mints`, `minVolumeUsd` / `maxVolumeUsd`, `direction` (`"in"` / `"out"`, needs `wallets`) |
| `creations` | `CreatedV1` | `sources`, `enriched`, `excludeMayhem` |
| `graduations` | `GraduatedV1` | `sources`, `excludeMayhem`, `minLiquiditySol` |
| `prices` | `PriceUpdateV1` | `sources`, `mints` (SOL, USDC, USDT included) |

```ts
const sub = client.stream("trades", {
  mints: ["3PFaeFMXiRVYueDCnHHSKndKDDpKZhbhFjQ13JXYpump"],
  minVolumeUsd: 10,
});

sub.on("subscribed", (filters) => console.log("live", filters));
sub.on("data", (swap) =>
  console.log(swap.signature, swap.swap.from.symbol, "→", swap.swap.to.symbol, swap.volumeUsd),
);
sub.on("error", (err) => console.error(err.code, err.message));

// later
sub.close(); // unsubscribe; not resurrected after reconnect
```

```ts
// Watch wallets for the SOL and tokens they send.
client
  .stream("transfers", { wallets: ["5G75aiNzTwpycR5c2AyfcYq2nxFLBYV4fyAjsTAeKihh"], direction: "out" })
  .on("data", (t) => console.log(t.wallet, "→", t.transfer.to, t.transfer.uiAmount, t.transfer.symbol));
```

The filter types are per channel, so TypeScript rejects a filter the channel does not take
(`sources` on `transfers`, `direction` on `trades`, volume bounds on `prices`, …). The server
rejects them too (`invalid_filters`), as it does an unknown source name.

### Plan rules

Plan limits arrive in the `connected` frame (`client.ready()` resolves with them, and the
`connected` event carries them):

| Field | Meaning | Starter | Pro |
|---|---|---|---|
| `connectionsPerStream` | live subscriptions per channel | 1 | 2 |
| `tradesRequiresMints` / `tradesMintCap` | `trades` must list `mints`; most `mints` | yes; 25 | no (firehose allowed); 100 |
| `transfersRequiresFilter` | `transfers` must list `wallets` or `mints` | yes | no (every transfer) |
| `transfersWalletCap` / `transfersMintCap` | most `wallets` / `mints` on `transfers` | 100 / 25 | 1,000 / 100 |

Free has `creations` and `graduations` only (`plan_restricted` elsewhere). The three
`transfers*` fields are **optional** on `ConnectionLimits`: a gateway that predates the
transfers channel does not send them, and the SDK connects without them.

### Trades, legs and symbols

A multi-hop swap (a trade routed through several pools) arrives as **one `SwapV1` per hop**,
all with the same `signature`. Each side is `{ mint, symbol, amount, uiAmount, decimals }`;
`symbol` is `null` until the token is resolved (usually its first second or two) or when it has
no on-chain symbol. Symbols are labels, not identities (anyone can name a token "USDC"): key on
`mint`. Transfers carry `transfer.symbol` the same way. Transfers have **no `source`** field.

### Connection events

```ts
client.on("connected", (limits) => { /* plan limits, see above */ });
client.on("reconnect", (attempt) => { /* about to retry */ });
client.on("error", (err) => { /* connection-level */ });
client.on("close", () => { /* socket dropped (may reconnect) */ });

await client.ready();   // resolves on first `connected` with the limits
await client.close();   // graceful shutdown; disables reconnect
```

### Heartbeat & reconnect

- **Heartbeat** (default `heartbeatMs: 15_000`): client sends `ping`; the socket is dead
  if **no inbound traffic of any kind** arrives within `2×heartbeatMs`. Set `0` to disable.
- **Reconnect** (on by default): exponential backoff with ±20% jitter, then re-sends every
  **active** subscription with the same `id` / filters. `reconnect: false` disables it.
  `unauthorized` is **terminal** (bad key — no retry loop). Other closes (including
  `slow_consumer`) reconnect after emitting `error` with the server code.

### Gap recovery after a reconnect

The socket resumes the **live** feed only — it does not replay the disconnect window for
you. Recover the gap with a REST backfill, then trust the live stream again. Every event
carries a `slot` for on-chain ordering and a `timestamp` (unix ms, nullable), which is
what you page the backfill with.

```ts
let lastTs = Date.now();

client.stream("creations").on("data", (ev) => {
  lastTs = ev.timestamp ?? lastTs;   // remember how far you got
  handle(ev);
});

// Fires after every (re)connect. On the first one the window is empty, so this
// is a no-op until there has actually been a gap.
client.on("connected", async () => {
  // Page is async-iterable and walks `next` for you.
  for await (const ev of await client.creations({ from: lastTs, to: Date.now() })) {
    handle(ev);
  }
});
```

**Backfill is `from`/`to` on timestamps** — there is no `since: slot` parameter. Use
`slot` to order events, not to resume.

**Recovery is at-least-once, so `handle()` must be idempotent.** A backfill re-delivers
events you may already hold, several events can share one `slot`, and several trades can
share one `signature`. Deduplicate on these wire fields:

| Channel | Dedup key |
| --- | --- |
| `creations`, `graduations` | `signature` |
| `trades` | `signature` + `wallet` + `source` + `swap.from.mint` + `swap.from.amount` + `swap.to.mint` + `swap.to.amount` |
| `transfers` (one message) | `signature` + `wallet` + `transfer.from` + `transfer.to` + `transfer.mint` + `transfer.amount` |
| `transfers` (one transfer, either side) | the same without `wallet` |
| `prices` | none needed: keep the latest per `mint` (highest `slot`) |

`signature` alone is **not** a trade key (a routed swap is one row per hop), and
`signature` + `wallet` is **not** a transfer key (one transaction can move two tokens for the
same wallet). Watching both ends of a transfer delivers it twice, once per watched `wallet`;
use the second transfers key to collapse those. Don't key on `volumeUsd`, `symbol` or
`timestamp`: a backfilled row can differ from the live event there (a `symbol` that was `null`
live is filled in once the token resolves). Two hops or transfers that match on every field
above (same wallets, tokens and raw amounts in one transaction) cannot be told apart from the
wire.

```ts
import type { SwapV1, TransferV1 } from "@anaxer/sdk";

const tradeKey = (s: SwapV1) =>
  [s.signature, s.wallet, s.source, s.swap.from.mint, s.swap.from.amount, s.swap.to.mint, s.swap.to.amount].join("|");
const transferKey = (t: TransferV1) =>
  [t.signature, t.wallet, t.transfer.from, t.transfer.to, t.transfer.mint, t.transfer.amount].join("|");
```

#### What each channel can recover

History is **7 days on every plan**.

| Channel | Backfill | Reach |
| --- | --- | --- |
| `creations` | `client.creations({ from, to })` | **Full** |
| `graduations` | `client.graduations({ from, to })` | **Full** |
| `trades` with `mints` | `client.tokens.trades(mint, { from, to })` per mint | **Full** for those mints |
| `trades` with `wallets` | `client.wallets.trades(wallet, { from, to })` per wallet | **Full** for those wallets |
| `transfers` with `wallets` | `client.wallets.transfers(wallet, { from, to })` per wallet (`direction`, `mints` as on the stream) | **Full** for those wallets |
| `trades` / `transfers` with neither | — | **None.** There is no chain-wide backfill, so an unfiltered firehose cannot recover a gap. |
| `prices` | — | **None.** Only the current price is stored (`client.tokens.price(mint)`); there is no price history to replay. |

If you run an unfiltered firehose (or a `mints`-only `transfers` subscription) and
completeness matters, subscribe with `wallets` or trade `mints` so a backfill covers you, or
treat the disconnect window as lossy and reconcile from your own store.

## REST

All authenticated GETs use `Authorization: Bearer`. Transient `429` / `5xx` retry up to
`restMaxRetries` (default `2`), honoring `Retry-After`. Other `4xx` throw immediately.

| Method | Returns |
|---|---|
| `client.tokens.get(mint)` | `TokenMetadataV1` |
| `client.tokens.batch(mints)` | `TokenMetadataV1[]` (up to **50** mints; unknown mints omitted) |
| `client.tokens.price(mint)` | `RestPriceV1` (the stream price plus `stale`) |
| `client.tokens.batchPrice(mints)` | `RestPriceV1[]` (up to **100** mints; missing prices omitted) |
| `client.tokens.trades(mint, opts?)` | `Page<SwapV1>`: `mint` on either side |
| `client.wallets.trades(wallet, opts?)` | `Page<SwapV1>`: the wallet's trades |
| `client.wallets.transfers(wallet, opts?)` | `Page<TransferV1>`: the wallet's transfers, sent and received |
| `client.creations(opts?)` | `Page<CreatedV1>` |
| `client.graduations(opts?)` | `Page<GraduatedV1>` |
| `client.launchpads.stats(opts?)` | `LaunchpadStatsV1` |

Every list takes `limit` (1–200, default 50), `cursor`, `from` and `to`, plus:

| Option | `tokens.trades` | `wallets.trades` | `wallets.transfers` | `creations` | `graduations` |
|---|---|---|---|---|---|
| `source` (one) or `sources` (list, ≤ 20) | ✅ | ✅ | — | ✅ | ✅ |
| `mints` (≤ 100) | path | ✅ either side | ✅ | — | — |
| `minVolumeUsd` / `maxVolumeUsd` | ✅ | ✅ | ✅ | — | — |
| `solOnly` | ✅ | ✅ | — | — | — |
| `direction` (`"in"` / `"out"`) | — | — | ✅ | — | — |
| `excludeMayhem` | — | — | — | ✅ | ✅ |
| `minLiquiditySol` | — | — | — | — | ✅ |

`source` and `sources` are exclusive (the types enforce it; passing both rejects with
`invalid_request` before any request). A set volume bound excludes rows with
`volumeUsd: null`. Quote assets (SOL, USDC, USDT) are rejected as the `tokens.trades` mint and
in `wallets.trades` `mints`; use `solOnly: true` for SOL-paired trades. `stale` on a REST price
is `true` when the trade behind it is over 15 minutes old (or unknown). Wallet and mint path
parameters are URL-encoded.

List endpoints return a `Page<T>` with `.data`, `.next`, `.window`. It is also an async
iterable that walks `next` on the **same** endpoint until null:

```ts
const page = await client.wallets.transfers("5G75aiNzTwpycR5c2AyfcYq2nxFLBYV4fyAjsTAeKihh", {
  direction: "in",
  minVolumeUsd: 100,
});
console.log(page.data.length, page.window);

for await (const t of page) {
  console.log(t.transfer.from, t.transfer.uiAmount, t.transfer.symbol);
}
```

## Config

```ts
connect({
  apiKey: "...",                          // required
  baseUrl: "https://api.anaxer.com",      // REST base (no trailing slash required)
  wsUrl: undefined,                       // default: derived from baseUrl → …/v1/stream
  reconnect: true,                        // or false | { baseDelayMs, maxDelayMs, maxRetries }
  heartbeatMs: 15_000,                    // 0 disables
  restMaxRetries: 2,                      // 0 disables REST retries
});
```

Local gateway: `baseUrl: "http://localhost:3010"` (derives `ws://localhost:3010/v1/stream`).

## Errors

REST non-2xx **throws** `AnaxerError` (`code`, `message`, `status`). WS `error` frames
**emit** on the matching `Subscription` (when `id` is present) or on `Client`.

```ts
import { AnaxerError } from "@anaxer/sdk";

try {
  await client.tokens.get(mint);
} catch (e) {
  if (e instanceof AnaxerError && e.code === "not_found") { /* … */ }
}
```

Worth knowing:

- An unknown query parameter is `400 invalid_request`, never silently ignored. The SDK sends
  only the parameters each endpoint takes; this matters when you call the API directly.
- A REST read that takes over 10 seconds answers `503 upstream_unavailable`. It is retried like
  any `5xx` (`restMaxRetries`), so narrow a slow query (`from` / `to`, filters) rather than
  raising retries.
- WebSocket: `invalid_filters` (bad or over-plan filters), `plan_restricted` (channel not on
  your plan), `subscription_limit` (over `connectionsPerStream`). See
  [errors](https://anaxer.com/docs/errors).

## Changes in 0.2.0

- `stream("transfers", …)` with `TransfersFilters`; `client.wallets.trades` and
  `client.wallets.transfers`.
- `sources` lists and `minVolumeUsd` / `maxVolumeUsd` on the list endpoints.
- `ConnectionLimits` gains optional `transfersRequiresFilter`, `transfersWalletCap` and
  `transfersMintCap` (absent from older gateways; the SDK does not require them).
- `TokenLegV1`, `ConnectionLimits` and the list option types are exported; legs and transfers
  carry `symbol`.
- The list option types (`TradesListOpts`, …) are now type aliases (a union keeps `source`
  and `sources` exclusive), so `interface X extends TradesListOpts` must become a `type`.
- Passing both `source` and `sources` rejects with `invalid_request`.

Still on 0.0.x or 0.1.0? Those versions reject every `connected` frame from the current
gateway; upgrade. Full history: [changelog](https://anaxer.com/docs/changelog).

## Types

Payload and filter types are exported from the package (`SwapV1`, `TransferV1`,
`TokenLegV1`, `CreatedV1`, `SubscriptionFiltersV1`, `TradesFilters`, `TransfersFilters`, …).
`WIRE_VERSION` is `1` (wire envelope `v`, independent of the npm package version).

`programs()` is not included (the public catalog type is not part of the SDK).

## License

MIT

---

## About this repository

This is a **read-only mirror**. ``packages/sdk`` in Anaxer's private monorepo is the
source of truth; this repo is regenerated from it on each release, so pull requests
here cannot be merged directly. Issues are very welcome — or reach us at
[anaxer.com/contact](https://anaxer.com/contact).
