import { z } from "zod";

export const priceUpdateV1Schema = z
  .object({
    type: z.literal("price"),
    source: z.string().min(1),
    mint: z.string().min(1),
    price: z
      .object({
        sol: z.number().finite(),
        usd: z.number().finite().nullable(),
      })
      .strict(),
    marketCapUsd: z.number().finite().nullable(),
    slot: z.number().int().positive(),
    timestamp: z.number().int().positive().nullable(),
  })
  .strict();

export type PriceUpdateV1 = z.infer<typeof priceUpdateV1Schema>;
