import { z } from "zod";

/**
 * Non-swap token movement for a watched wallet.
 * `transfer.from` / `transfer.to` are counterparty wallet addresses, not token legs.
 * No `source`: ~97% of transfers are sent by the wallet itself, not through an app
 * (2026-10-30 replay), so there is nothing to name (founder 2026-11-01).
 */
export const transferV1Schema = z
  .object({
    type: z.literal("transfer"),
    wallet: z.string().min(1),
    /** USD value of the transfer at the time it was decoded (build-plan 43). */
    volumeUsd: z.number().finite().nullable(),
    transfer: z
      .object({
        from: z.string().min(1),
        to: z.string().min(1),
        mint: z.string().min(1),
        /** The token's symbol (build-plan 45); null until resolved or when it has none. */
        symbol: z.string().nullable(),
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
