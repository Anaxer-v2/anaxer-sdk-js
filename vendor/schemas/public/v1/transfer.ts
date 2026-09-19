import { z } from "zod";

/**
 * Non-swap token movement for a watched wallet.
 * `transfer.from` / `transfer.to` are counterparty wallet addresses, not token legs.
 */
export const transferV1Schema = z
  .object({
    type: z.literal("transfer"),
    source: z.string().min(1).nullable(),
    wallet: z.string().min(1),
    transfer: z
      .object({
        from: z.string().min(1),
        to: z.string().min(1),
        mint: z.string().min(1),
        amount: z.string().min(1),
        uiAmount: z.number().finite(),
        decimals: z.number().int().min(0).max(18),
      })
      .strict(),
    signature: z.string().min(1),
    slot: z.number().int().positive(),
    timestamp: z.number().int().positive().nullable(),
  })
  .strict();

export type TransferV1 = z.infer<typeof transferV1Schema>;
