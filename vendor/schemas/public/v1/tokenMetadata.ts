import { z } from "zod";
import { socialsV1Schema } from "./lifecycle";

/** Off-chain fetch lifecycle on `token_metadata.fetch_status` (DB / internal). Not on the public TokenMetadataV1 wire (build-plan 21b). */
export const tokenMetadataFetchStatusV1Schema = z.enum([
  "pending",
  "ok",
  "failed",
  "skipped",
]);

export type TokenMetadataFetchStatusV1 = z.infer<typeof tokenMetadataFetchStatusV1Schema>;

/**
 * REST token metadata payload (build-plan 21b lean wire).
 * `supply` is a UI decimal string (raw ÷ 10^decimals), not the raw u64.
 * Not a WS channel event — no `type` discriminator.
 */
export const tokenMetadataV1Schema = z
  .object({
    mint: z.string().min(1),
    name: z.string().nullable(),
    symbol: z.string().nullable(),
    supply: z.string().nullable(),
    socials: socialsV1Schema,
  })
  .strict();

export type TokenMetadataV1 = z.infer<typeof tokenMetadataV1Schema>;
