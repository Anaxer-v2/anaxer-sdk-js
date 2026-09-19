import { EventEmitter } from "node:events";
import type { ClientConfig } from "./connect";
import { resolveClientConfig } from "./connect";
import { AnaxerError } from "./errors";
import {
  createRestApi,
  type CreationsListOpts,
  type GraduationsListOpts,
  type RestApi,
  type TradesListOpts,
} from "./rest/endpoints";
import { HttpClient } from "./rest/http";
import type { Page } from "./rest/pagination";
import type {
  CreatedV1,
  CreationsFilters,
  GraduatedV1,
  GraduationsFilters,
  PriceUpdateV1,
  PricesFilters,
  SwapV1,
  TradesFilters,
} from "./types";
import { WsConnection, type ConnectionLimits } from "./ws/connection";
import type { CreateSocket } from "./ws/socket";
import { Subscription } from "./ws/subscription";

export interface ClientEvents {
  connected: [limits: ConnectionLimits];
  open: [];
  close: [];
  reconnect: [attempt: number];
  error: [err: AnaxerError];
}

export type { CreationsListOpts, GraduationsListOpts, TradesListOpts };

/**
 * Public SDK client: WS lifecycle + REST namespaces.
 * Extends Node `EventEmitter` (doc 22 §3a Q6).
 */
export class Client extends EventEmitter {
  private readonly conn: WsConnection;
  private readonly rest: RestApi;

  readonly tokens: RestApi["tokens"];
  readonly launchpads: RestApi["launchpads"];

  /** @internal test seam — not part of the public ClientConfig. */
  constructor(
    config: ClientConfig,
    createSocketFn?: CreateSocket,
    fetchFn?: typeof fetch,
  ) {
    super();
    const resolved = resolveClientConfig(config);
    this.conn = new WsConnection(resolved, createSocketFn);
    this.conn.on("connected", (limits: ConnectionLimits) => this.emit("connected", limits));
    this.conn.on("open", () => this.emit("open"));
    this.conn.on("close", () => this.emit("close"));
    this.conn.on("reconnect", (attempt: number) => this.emit("reconnect", attempt));
    // Node EventEmitter throws on `error` with zero listeners — only forward when watched.
    this.conn.on("error", (err: AnaxerError) => {
      if (this.listenerCount("error") > 0) {
        this.emit("error", err);
      }
    });

    const http = new HttpClient({
      baseUrl: resolved.baseUrl,
      apiKey: resolved.apiKey,
      maxRetries: resolved.restMaxRetries,
      fetchFn,
    });
    this.rest = createRestApi(http);
    this.tokens = this.rest.tokens;
    this.launchpads = this.rest.launchpads;
  }

  stream(channel: "trades", filters?: TradesFilters): Subscription<SwapV1>;
  stream(channel: "creations", filters?: CreationsFilters): Subscription<CreatedV1>;
  stream(channel: "graduations", filters?: GraduationsFilters): Subscription<GraduatedV1>;
  stream(channel: "prices", filters?: PricesFilters): Subscription<PriceUpdateV1>;
  stream(
    channel: "trades" | "creations" | "graduations" | "prices",
    filters?: TradesFilters | CreationsFilters | GraduationsFilters | PricesFilters,
  ): Subscription {
    return this.conn.stream(channel, filters);
  }

  ready(): Promise<ConnectionLimits> {
    return this.conn.ready();
  }

  close(): Promise<void> {
    return this.conn.close();
  }

  override on<K extends keyof ClientEvents>(
    event: K,
    listener: (...args: ClientEvents[K]) => void,
  ): this;
  override on(event: string | symbol, listener: (...args: unknown[]) => void): this;
  override on(event: string | symbol, listener: (...args: unknown[]) => void): this {
    return super.on(event, listener);
  }

  override off<K extends keyof ClientEvents>(
    event: K,
    listener: (...args: ClientEvents[K]) => void,
  ): this;
  override off(event: string | symbol, listener: (...args: unknown[]) => void): this;
  override off(event: string | symbol, listener: (...args: unknown[]) => void): this {
    return super.off(event, listener);
  }

  override once<K extends keyof ClientEvents>(
    event: K,
    listener: (...args: ClientEvents[K]) => void,
  ): this;
  override once(event: string | symbol, listener: (...args: unknown[]) => void): this;
  override once(event: string | symbol, listener: (...args: unknown[]) => void): this {
    return super.once(event, listener);
  }

  creations(opts?: CreationsListOpts): Promise<Page<CreatedV1>> {
    return this.rest.creations(opts);
  }

  graduations(opts?: GraduationsListOpts): Promise<Page<GraduatedV1>> {
    return this.rest.graduations(opts);
  }
}
