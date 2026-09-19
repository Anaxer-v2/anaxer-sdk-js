/** Wrapped SOL mint — public-contract constant (build-plan 32b). */
export const SOL_MINT = "So11111111111111111111111111111111111111112";

/**
 * Quote assets — not trackable tokens; rejected in `mints` on trades (32b §3.3).
 * Values must match `PRICE_FEED_ACCOUNTS` in `@anaxer/shared/pythPriceFeeds`.
 */
export const QUOTE_ASSET_MINTS: ReadonlySet<string> = new Set([
  SOL_MINT,
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // USDT
]);
