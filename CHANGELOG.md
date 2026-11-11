# Changelog — `@anaxer/sdk`

Full product changelog: https://anaxer.com/docs/changelog

## 0.2.0 — unreleased

Needs the gateway release that ships transfers and wallet history (November 2026).

- **Transfers stream:** `client.stream("transfers", { wallets, mints, minVolumeUsd, maxVolumeUsd, direction })`
  yields `TransferV1`. `TransfersFilters` is exported.
- **Wallet history:** `client.wallets.trades(wallet, opts)` and `client.wallets.transfers(wallet, opts)`
  return pages (`mints`, `sources`, size, `solOnly`; `direction` on transfers). The wallet is URL-encoded.
- **List filters:** `sources` (array, exclusive with `source`) on token trades, creations and graduations;
  `minVolumeUsd` / `maxVolumeUsd` on token trades. Passing both `source` and `sources` rejects with
  `invalid_request`.
- **Connected limits:** `ConnectionLimits` gains optional `transfersRequiresFilter`, `transfersWalletCap`
  and `transfersMintCap`. They are optional so the SDK still connects to a gateway that does not send them.
- `TokenLegV1`, `ConnectionLimits` and the list option types are exported. Legs and transfers carry
  `symbol` (nullable).
- The list option types are now type aliases (a union keeps `source` and `sources` exclusive):
  `interface X extends TradesListOpts` must become a type intersection.
- README: plan rules, dedup keys from wire fields (a routed swap is one row per hop), recovery with the
  wallet endpoints, 7-day history, absolute links.

## 0.1.2 — 2026-09-19

- Package metadata links the site and the public mirror repository.

## 0.1.1 — 2026-07-23

- `tokens.trades` sends `solOnly`.

## 0.1.0 — 2026-07-15

- First release: `trades`, `creations`, `graduations`, `prices` streams; token, creations, graduations and
  launchpad REST reads. **Deprecated:** 0.1.0 (and 0.0.1) fail on every `connected` frame from the current
  gateway; upgrade.
