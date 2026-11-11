import { z } from "zod";
import type { Trade } from "../../trade";

/**
 * Token leg — the internal trade leg with `symbol` always present (build-plan 45: null until the
 * token is resolved, or when it has no symbol on chain).
 */
export const tokenLegV1Schema = z
  .object({
    mint: z.string().min(1),
    symbol: z.string().nullable(),
    amount: z.string().min(1),
    uiAmount: z.number().finite(),
    decimals: z.number().int().min(0).max(18),
  })
  .strict();

export type TokenLegV1 = z.infer<typeof tokenLegV1Schema>;

/**
 * Public swap payload (trades channel, envelope type `"swap"`).
 * Diverges from internal `Trade`: adds `type`, nests legs under `swap`, nullable timestamp.
 */
export const swapV1Schema = z
  .object({
    type: z.literal("swap"),
    source: z.string().min(1),
    wallet: z.string().min(1),
    volumeUsd: z.number().finite().nullable(),
    swap: z
      .object({
        from: tokenLegV1Schema,
        to: tokenLegV1Schema,
      })
      .strict(),
    signature: z.string().min(1),
    slot: z.number().int().positive(),
    timestamp: z.number().int().positive().nullable(),
  })
  .strict();

export type SwapV1 = z.infer<typeof swapV1Schema>;

/** Type-level: a v1 token leg is a valid internal Trade leg (the internal `symbol` is optional). */
type _AssertLegEqual = TokenLegV1 extends Trade["from"]
  ? Required<Trade["from"]> extends TokenLegV1
    ? true
    : never
  : never;
const _legEqual: _AssertLegEqual = true;
void _legEqual;
