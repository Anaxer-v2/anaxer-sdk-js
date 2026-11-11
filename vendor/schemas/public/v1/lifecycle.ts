import { z } from "zod";

/** Closed socials set — unknown keys from off-chain JSON are dropped before exposure. */
export const socialsV1Schema = z
  .object({
    website: z.string().nullable(),
    twitter: z.string().nullable(),
    telegram: z.string().nullable(),
  })
  .strict();

export type SocialsV1 = z.infer<typeof socialsV1Schema>;

export const createdV1Schema = z
  .object({
    type: z.literal("created"),
    source: z.string().min(1),
    mint: z.string().nullable(),
    name: z.string().nullable(),
    symbol: z.string().nullable(),
    creator: z.string().nullable(),
    uri: z.string().nullable(),
    mayhemMode: z.boolean(),
    socials: socialsV1Schema,
    signature: z.string().min(1),
    slot: z.number().int().positive(),
    timestamp: z.number().int().positive().nullable(),
  })
  .strict();

export type CreatedV1 = z.infer<typeof createdV1Schema>;

/** A graduation's liquidity as its quote token (same shape as a transfer's token). */
export const liquidityQuoteV1Schema = z
  .object({
    mint: z.string().min(1),
    symbol: z.string().nullable(),
    amount: z.string(),
    uiAmount: z.number().finite().nullable(),
    decimals: z.number().int().nullable(),
  })
  .strict();

export type LiquidityQuoteV1 = z.infer<typeof liquidityQuoteV1Schema>;

export const graduatedV1Schema = z
  .object({
    type: z.literal("graduated"),
    source: z.string().min(1),
    mint: z.string().nullable(),
    name: z.string().nullable(),
    symbol: z.string().nullable(),
    creator: z.string().nullable(),
    uri: z.string().nullable(),
    mayhemMode: z.boolean(),
    socials: socialsV1Schema,
    /** SOL value of the new pool's quote side, whatever token the curve was quoted in. */
    liquiditySol: z.number().finite().nullable(),
    /** USD value of the same; null when the quote token has no price. */
    liquidityUsd: z.number().finite().nullable(),
    /** The pool's quote side as the token it is (SOL, USDC, USDT or a community token). */
    liquidityQuote: liquidityQuoteV1Schema.nullable(),
    timeToGraduateSeconds: z.number().finite().nullable(),
    signature: z.string().min(1),
    slot: z.number().int().positive(),
    timestamp: z.number().int().positive().nullable(),
  })
  .strict();

export type GraduatedV1 = z.infer<typeof graduatedV1Schema>;
