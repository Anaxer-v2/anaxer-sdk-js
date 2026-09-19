import type { DataMessageV1 } from "./envelope";
import type { CreatedV1, SocialsV1 } from "./lifecycle";
import type { GraduatedV1 } from "./lifecycle";
import type { SwapV1 } from "./swap";

/** Internal consumer trade shape (pre-v1 flat Trade). */
export interface TradeConsumerInput {
  signature: string;
  slot: number;
  timestamp: number | null;
  wallet: string;
  source: string;
  from: SwapV1["swap"]["from"];
  to: SwapV1["swap"]["to"];
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
}

const NULL_SOCIALS = { website: null, twitter: null, telegram: null } as const;

/** Nest legs under `swap`, add `type: "swap"`. */
export function reshapeTradeToSwapV1(consumer: TradeConsumerInput): SwapV1 {
  const { from, to, ...rest } = consumer;
  return {
    type: "swap",
    ...rest,
    swap: { from, to },
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
  return {
    type: "graduated",
    signature: consumer.signature,
    slot: consumer.slot,
    timestamp: consumer.timestamp,
    source: consumer.source,
    mint: consumer.mint,
    name: consumer.name ?? null,
    symbol: consumer.symbol ?? null,
    creator: consumer.creator ?? null,
    uri: uri ?? null,
    mayhemMode: consumer.mayhemMode === true,
    socials: { ...NULL_SOCIALS },
    liquiditySol,
    timeToGraduateSeconds: null,
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
