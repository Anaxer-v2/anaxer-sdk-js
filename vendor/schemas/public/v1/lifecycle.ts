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
    liquiditySol: z.number().finite().nullable(),
    timeToGraduateSeconds: z.number().finite().nullable(),
    signature: z.string().min(1),
    slot: z.number().int().positive(),
    timestamp: z.number().int().positive().nullable(),
  })
  .strict();

export type GraduatedV1 = z.infer<typeof graduatedV1Schema>;
