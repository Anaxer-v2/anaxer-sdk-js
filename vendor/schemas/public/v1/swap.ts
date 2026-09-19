import { z } from "zod";
import type { Trade } from "../../trade";

/** Token leg — structurally identical to the internal trade leg. */
export const tokenLegV1Schema = z
  .object({
    mint: z.string().min(1),
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

/** Type-level: v1 token leg matches internal Trade leg. */
type _AssertLegEqual = TokenLegV1 extends Trade["from"]
  ? Trade["from"] extends TokenLegV1
    ? true
    : never
  : never;
const _legEqual: _AssertLegEqual = true;
void _legEqual;
