import { z } from "zod";
import { channelV1Schema, subscriptionIdSchema } from "./envelope";
import { errorMessageV1Schema } from "./errors";
import { subscriptionFiltersV1Schema } from "./filters";

/** Client → server */
export const subscribeMessageV1Schema = z
  .object({
    type: z.literal("subscribe"),
    id: subscriptionIdSchema,
    channel: channelV1Schema,
    filters: subscriptionFiltersV1Schema,
  })
  .strict();

export type SubscribeMessageV1 = z.infer<typeof subscribeMessageV1Schema>;

export const unsubscribeMessageV1Schema = z
  .object({
    type: z.literal("unsubscribe"),
    id: subscriptionIdSchema,
  })
  .strict();

export type UnsubscribeMessageV1 = z.infer<typeof unsubscribeMessageV1Schema>;

export const pingMessageV1Schema = z
  .object({
    type: z.literal("ping"),
  })
  .strict();

export type PingMessageV1 = z.infer<typeof pingMessageV1Schema>;

export const clientControlMessageV1Schema = z.discriminatedUnion("type", [
  subscribeMessageV1Schema,
  unsubscribeMessageV1Schema,
  pingMessageV1Schema,
]);

export type ClientControlMessageV1 = z.infer<typeof clientControlMessageV1Schema>;

/** Server → client */
export const connectedMessageV1Schema = z
  .object({
    v: z.literal(1),
    type: z.literal("connected"),
    ts: z.number().int().positive(),
    limits: z
      .object({
        connectionsPerStream: z.number().int().positive(),
        tradesRequiresMints: z.boolean(),
        tradesMintCap: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();

export type ConnectedMessageV1 = z.infer<typeof connectedMessageV1Schema>;

export const subscribedMessageV1Schema = z
  .object({
    v: z.literal(1),
    type: z.literal("subscribed"),
    id: subscriptionIdSchema,
    channel: channelV1Schema,
    filters: subscriptionFiltersV1Schema,
    ts: z.number().int().positive(),
  })
  .strict();

export type SubscribedMessageV1 = z.infer<typeof subscribedMessageV1Schema>;

export const unsubscribedMessageV1Schema = z
  .object({
    v: z.literal(1),
    type: z.literal("unsubscribed"),
    id: subscriptionIdSchema,
    ts: z.number().int().positive(),
  })
  .strict();

export type UnsubscribedMessageV1 = z.infer<typeof unsubscribedMessageV1Schema>;

export const pongMessageV1Schema = z
  .object({
    v: z.literal(1),
    type: z.literal("pong"),
    ts: z.number().int().positive(),
  })
  .strict();

export type PongMessageV1 = z.infer<typeof pongMessageV1Schema>;

export const serverControlMessageV1Schema = z.discriminatedUnion("type", [
  connectedMessageV1Schema,
  subscribedMessageV1Schema,
  unsubscribedMessageV1Schema,
  pongMessageV1Schema,
  errorMessageV1Schema,
]);

export type ServerControlMessageV1 = z.infer<typeof serverControlMessageV1Schema>;
