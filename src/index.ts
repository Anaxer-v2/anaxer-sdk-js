import { Client } from "./client";
import type { ClientConfig } from "./connect";

export type { ClientConfig } from "./connect";
export { Client } from "./client";
export type {
  CreationsListOpts,
  GraduationsListOpts,
  ListWindowOpts,
  SizeFilterOpts,
  SourceFilterOpts,
  TimeInput,
  TradesListOpts,
  WalletTradesListOpts,
  WalletTransfersListOpts,
} from "./rest/endpoints";
export type { ConnectionLimits } from "./ws/connection";
export type { ClientEvents } from "./client";
export { Page, type PageEnvelope, type PageWindow } from "./rest/pagination";
export { AnaxerError, type AnaxerErrorCode } from "./errors";
export { Subscription, type StreamChannel } from "./ws/subscription";
export {
  WIRE_VERSION,
  type SwapV1,
  type TokenLegV1,
  type CreatedV1,
  type GraduatedV1,
  type PriceUpdateV1,
  type RestPriceV1,
  type TransferV1,
  type TokenMetadataV1,
  type LaunchpadStatsV1,
  type SubscriptionFiltersV1,
  type TradesFilters,
  type CreationsFilters,
  type GraduationsFilters,
  type PricesFilters,
  type TransfersFilters,
} from "./types";

/** Sync factory — socket opens lazily on first `stream()` / `ready()` (doc 22 decision 9). */
export function connect(config: ClientConfig): Client {
  return new Client(config);
}
