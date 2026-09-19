import { z } from "zod";

/** Closed error-code enum — additive within v1 only. */
export const errorCodeV1Schema = z.enum([
  "invalid_message",
  "invalid_filters",
  "unknown_channel",
  "subscription_limit",
  "duplicate_id",
  "unknown_subscription",
  "unauthorized",
  "slow_consumer",
  "plan_restricted",
  "internal_error",
]);

export type ErrorCodeV1 = z.infer<typeof errorCodeV1Schema>;

export const errorMessageV1Schema = z
  .object({
    v: z.literal(1),
    type: z.literal("error"),
    code: errorCodeV1Schema,
    message: z.string().min(1),
    id: z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/).optional(),
    ts: z.number().int().positive(),
  })
  .strict();

export type ErrorMessageV1 = z.infer<typeof errorMessageV1Schema>;
