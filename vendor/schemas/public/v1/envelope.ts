import { z } from "zod";
import { createdV1Schema, graduatedV1Schema } from "./lifecycle";
import { priceUpdateV1Schema } from "./price";
import { swapV1Schema } from "./swap";
import { transferV1Schema } from "./transfer";

export const channelV1Schema = z.enum([
  "trades",
  "creations",
  "graduations",
  "prices",
  "transfers",
]);

export type ChannelV1 = z.infer<typeof channelV1Schema>;

export const dataMessageTypeV1Schema = z.enum([
  "swap",
  "created",
  "graduated",
  "price",
  "transfer",
]);

export type DataMessageTypeV1 = z.infer<typeof dataMessageTypeV1Schema>;

const subscriptionIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/);

/**
 * Flat data-message envelope — pipeline timing telemetry is not part of v1.
 *
 * Built as a discriminated union on `type` (rather than a bare `data: z.union([...])`)
 * so `channel` and `data` are pinned to the matching payload per branch — a message
 * claiming `channel: "trades"` cannot carry `graduated` data, and vice versa. A plain
 * union of `data` alternatives would accept that mismatch silently since it has no
 * visibility into sibling envelope fields.
 */
const swapDataMessageV1Schema = z
  .object({
    v: z.literal(1),
    channel: z.literal("trades"),
    type: z.literal("swap"),
    sub: subscriptionIdSchema,
    ts: z.number().int().positive(),
    data: swapV1Schema,
  })
  .strict();

const createdDataMessageV1Schema = z
  .object({
    v: z.literal(1),
    channel: z.literal("creations"),
    type: z.literal("created"),
    sub: subscriptionIdSchema,
    ts: z.number().int().positive(),
    data: createdV1Schema,
  })
  .strict();

const graduatedDataMessageV1Schema = z
  .object({
    v: z.literal(1),
    channel: z.literal("graduations"),
    type: z.literal("graduated"),
    sub: subscriptionIdSchema,
    ts: z.number().int().positive(),
    data: graduatedV1Schema,
  })
  .strict();

const priceDataMessageV1Schema = z
  .object({
    v: z.literal(1),
    channel: z.literal("prices"),
    type: z.literal("price"),
    sub: subscriptionIdSchema,
    ts: z.number().int().positive(),
    data: priceUpdateV1Schema,
  })
  .strict();

const transferDataMessageV1Schema = z
  .object({
    v: z.literal(1),
    channel: z.literal("transfers"),
    type: z.literal("transfer"),
    sub: subscriptionIdSchema,
    ts: z.number().int().positive(),
    data: transferV1Schema,
  })
  .strict();

export const dataMessageV1Schema = z.discriminatedUnion("type", [
  swapDataMessageV1Schema,
  createdDataMessageV1Schema,
  graduatedDataMessageV1Schema,
  priceDataMessageV1Schema,
  transferDataMessageV1Schema,
]);

export type DataMessageV1 = z.infer<typeof dataMessageV1Schema>;

export { subscriptionIdSchema };
