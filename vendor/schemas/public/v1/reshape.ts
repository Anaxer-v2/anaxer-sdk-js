import type { DataMessageV1 } from "./envelope";
import type { CreatedV1, SocialsV1 } from "./lifecycle";
import type { GraduatedV1, LiquidityQuoteV1 } from "./lifecycle";
import type { PriceUpdateV1 } from "./price";
import type { SwapV1, TokenLegV1 } from "./swap";

/** A consumer token leg: `symbol` is absent on events written before build-plan 45. */
export type TokenLegConsumerInput = Omit<TokenLegV1, "symbol"> & { symbol?: string | null };

/** Internal consumer trade shape (pre-v1 flat Trade). */
export interface TradeConsumerInput {
  signature: string;
  slot: number;
  timestamp: number | null;
  wallet: string;
  source: string;
  from: TokenLegConsumerInput;
  to: TokenLegConsumerInput;
  volumeUsd: number | null;
}

/** Internal consumer created shape (may still carry pool/uri/socials). */
export interface CreatedConsumerInput {
  signature: string;
  slot: number;
  timestamp: number | null;
  source: string;
  mint: string | null;
  creator: string | null;
  name: string | null;
  symbol: string | null;
  uri?: string | null;
  pool?: string | null;
  mayhemMode?: boolean;
  /** Present on enrichment-success consumers (build-plan 18). */
  socials?: SocialsV1;
}

/** Internal consumer graduated shape (may still carry pool/uri). */
export interface GraduatedConsumerInput {
  signature: string;
  slot: number;
  timestamp: number | null;
  source: string;
  mint: string | null;
  pool?: string | null;
  uri?: string | null;
  name?: string | null;
  symbol?: string | null;
  creator?: string | null;
  mayhemMode?: boolean;
  /** Lamports string | null (internal); reshape converts to SOL number. */
  liquiditySol?: string | null;
  liquidityQuote?: { mint: string; symbol: string | null; amount: string; decimals: number | null } | null;
  liquidityUsd?: number | null;
}

/**
 * A graduation's quote side on the wire, `uiAmount` from the raw amount (null without decimals).
 * Shared with REST (`apps/gateway/src/rest/graduations.ts`) so both send the same shape.
 */
export function liquidityQuoteToV1(
  q: { mint: string; symbol: string | null; amount: string; decimals: number | null } | null | undefined,
): LiquidityQuoteV1 | null {
  if (!q) return null;
  const ui = q.decimals === null ? null : Number(q.amount) / 10 ** q.decimals;
  return { mint: q.mint, symbol: q.symbol, amount: q.amount, uiAmount: ui !== null && Number.isFinite(ui) ? ui : null, decimals: q.decimals };
}

const NULL_SOCIALS = { website: null, twitter: null, telegram: null } as const;

/** A leg in wire order, `symbol` null when the event predates it (build-plan 45). */
function tokenLegV1(leg: TokenLegConsumerInput): TokenLegV1 {
  return { mint: leg.mint, symbol: leg.symbol ?? null, amount: leg.amount, uiAmount: leg.uiAmount, decimals: leg.decimals };
}

/** Nest legs under `swap`, add `type: "swap"`. */
export function reshapeTradeToSwapV1(consumer: TradeConsumerInput): SwapV1 {
  const { from, to, ...rest } = consumer;
  return {
    type: "swap",
    ...rest,
    swap: { from: tokenLegV1(from), to: tokenLegV1(to) },
  };
}

/** A price update in wire order, `symbol` null when it predates it (build-plan 45). */
export function reshapePriceV1(p: Omit<PriceUpdateV1, "symbol"> & { symbol?: string | null }): PriceUpdateV1 {
  return {
    type: "price",
    source: p.source,
    mint: p.mint,
    symbol: p.symbol ?? null,
    price: p.price,
    marketCapUsd: p.marketCapUsd,
    slot: p.slot,
    timestamp: p.timestamp,
  };
}

/**
 * Drop `pool`, add `type: "created"`, expose on-chain `uri` (null when absent).
 * Fast path defaults to null socials; enrichment-success path passes resolved socials
 * via the second arg or `consumer.socials` (doc 18).
 */
export function reshapeCreatedToCreatedV1(
  consumer: CreatedConsumerInput,
  socials?: SocialsV1,
): CreatedV1 {
  const { pool: _pool, uri, socials: fromConsumer, mayhemMode, ...rest } = consumer;
  return {
    type: "created",
    ...rest,
    uri: uri ?? null,
    mayhemMode: mayhemMode === true,
    socials: socials ?? fromConsumer ?? { ...NULL_SOCIALS },
  };
}

/**
 * Drop `pool`, add `type: "graduated"`, stub unknown fields.
 * `uri` from create-cache (doc 18); `socials` / `timeToGraduateSeconds` / name fields
 * stay null until doc 08 infrastructure fills them on the wire path.
 * `liquiditySol` is SOL number | null on the wire (lamports on the consumer).
 */
export function reshapeGraduatedToGraduatedV1(
  consumer: GraduatedConsumerInput,
): GraduatedV1 {
  const { pool: _pool, uri, ..._rest } = consumer;
  const lamports = consumer.liquiditySol;
  let liquiditySol: number | null = null;
  if (lamports != null && lamports !== "") {
    const n = Number(lamports) / 1e9;
    liquiditySol = Number.isFinite(n) ? n : null;
  }
  // Field order as graduatedV1Schema and REST (it led with signature / slot / timestamp before).
  return {
    type: "graduated",
    source: consumer.source,
    mint: consumer.mint,
    name: consumer.name ?? null,
    symbol: consumer.symbol ?? null,
    creator: consumer.creator ?? null,
    uri: uri ?? null,
    mayhemMode: consumer.mayhemMode === true,
    socials: { ...NULL_SOCIALS },
    liquiditySol,
    liquidityUsd: consumer.liquidityUsd ?? null,
    liquidityQuote: liquidityQuoteToV1(consumer.liquidityQuote),
    timeToGraduateSeconds: null,
    signature: consumer.signature,
    slot: consumer.slot,
    timestamp: consumer.timestamp,
  };
}

export function wrapDataMessage(
  channel: DataMessageV1["channel"],
  type: DataMessageV1["type"],
  data: DataMessageV1["data"],
  sub = "conformance-1",
): DataMessageV1 {
  return {
    v: 1,
    channel,
    type,
    sub,
    ts: Date.now(),
    data,
  } as DataMessageV1;
}
