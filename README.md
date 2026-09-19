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

Wire contracts: [`docs/api/ws-v1.md`](../../docs/api/ws-v1.md),
[`docs/api/rest-v1.md`](../../docs/api/rest-v1.md).

## Streaming (`client.stream`)

| Channel | Payload type | Notes |
|---|---|---|
| `trades` | `SwapV1` | Optional `sources`, `mints`, `wallets`, volume bounds, `solOnly` |
| `creations` | `CreatedV1` | Optional `sources`, `enriched`, `excludeMayhem` |
| `graduations` | `GraduatedV1` | Optional `sources`, `excludeMayhem`, `minLiquiditySol` |
| `prices` | `PriceUpdateV1` | Optional `sources`, `mints` |

```ts
const sub = client.stream("trades", {
  sources: ["pump_fun"],
  minVolumeUsd: 10,
});

sub.on("subscribed", (filters) => console.log("live", filters));
sub.on("data", (swap) => console.log(swap.signature, swap.volumeUsd));
sub.on("error", (err) => console.error(err.code, err.message));

// later
sub.close(); // unsubscribe; not resurrected after reconnect
```

### Connection events

```ts
client.on("connected", ({ connectionsPerStream }) => { /* per-channel plan cap */ });
client.on("reconnect", (attempt) => { /* about to retry */ });
client.on("error", (err) => { /* connection-level */ });
client.on("close", () => { /* socket dropped (may reconnect) */ });

await client.ready();   // resolves on first `connected`
await client.close();   // graceful shutdown; disables reconnect
```

### Heartbeat & reconnect

- **Heartbeat** (default `heartbeatMs: 15_000`): client sends `ping`; the socket is dead
  if **no inbound traffic of any kind** arrives within `2×heartbeatMs`. Set `0` to disable.
- **Reconnect** (on by default): exponential backoff with ±20% jitter, then re-sends every
  **active** subscription with the same `id` / filters. `reconnect: false` disables it.
  `unauthorized` is **terminal** (bad key — no retry loop). Other closes (including
  `slow_consumer`) reconnect after emitting `error` with the server code.

### No gap recovery in v1

On reconnect the SDK resumes the **live** feed only. Events during the disconnect window
are **not** replayed — the wire protocol has no sequence numbers or cursors yet. Plan for
at-most-once delivery across reconnects.

### Intentional v1 omissions

- **`transfers` channel** — not exposed on `stream()` until server-side ingestion ships.
  The `TransferV1` **type** is still exported for callers that need the shape.
- **`programs()`** — not included; the public catalog type is not in `@anaxer/schemas`.

## REST

All authenticated GETs use `Authorization: Bearer`. Transient `429` / `5xx` retry up to
`restMaxRetries` (default `2`), honoring `Retry-After`. Other `4xx` throw immediately.

| Method | Returns |
|---|---|
| `client.tokens.get(mint)` | `TokenMetadataV1` |
| `client.tokens.batch(mints)` | `TokenMetadataV1[]` (unwraps `{ data }`, max 50) |
| `client.tokens.price(mint)` | `PriceUpdateV1` |
| `client.tokens.batchPrice(mints)` | `PriceUpdateV1[]` |
| `client.tokens.trades(mint, opts?)` | `Page<SwapV1>` (either swap leg; opts: `limit`, `cursor`, `from`, `to`, `source`, `solOnly`) |
| `client.creations(opts?)` | `Page<CreatedV1>` |
| `client.graduations(opts?)` | `Page<GraduatedV1>` |
| `client.launchpads.stats(opts?)` | `LaunchpadStatsV1` |

List endpoints return a `Page<T>` with `.data`, `.next`, `.window`. It is also an async
iterable that walks `next` on the **same** endpoint until null:

```ts
const page = await client.creations({ excludeMayhem: true, limit: 50 });
console.log(page.data.length, page.window);

for await (const created of page) {
  console.log(created.mint);
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

## Types

Payload and filter types are exported from the package (`SwapV1`, `CreatedV1`,
`SubscriptionFiltersV1`, `TradesFilters`, …). `WIRE_VERSION` is `1` (wire envelope `v`,
independent of the npm package version).

## License

MIT

---

## About this repository

This is a **read-only mirror**. ``packages/sdk`` in Anaxer's private monorepo is the
source of truth; this repo is regenerated from it on each release, so pull requests
here cannot be merged directly. Issues are very welcome — or reach us at
[anaxer.com/contact](https://anaxer.com/contact).
