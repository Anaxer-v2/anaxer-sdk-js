import { EventEmitter } from "node:events";
import type { SubscriptionFiltersV1 } from "../types";
import { AnaxerError } from "../errors";

export type StreamChannel = "trades" | "creations" | "graduations" | "prices";

export interface SubscriptionEvents<T> {
  data: [data: T];
  subscribed: [filters: SubscriptionFiltersV1];
  error: [err: AnaxerError];
  close: [];
}

/**
 * Per-`stream()` handle. Extends Node `EventEmitter` (doc 22 §3a Q6).
 * `close()` sends unsubscribe (via the connection) and removes this sub from the
 * active map so it is not re-sent after reconnect.
 */
export class Subscription<T = unknown> extends EventEmitter {
  readonly id: string;
  readonly channel: StreamChannel;
  /** Original filters object sent (and re-sent) on subscribe. */
  readonly filters: SubscriptionFiltersV1;

  private _closed = false;
  private readonly requestClose: (sub: Subscription<T>) => void;

  constructor(
    id: string,
    channel: StreamChannel,
    filters: SubscriptionFiltersV1,
    requestClose: (sub: Subscription<T>) => void,
  ) {
    super();
    this.id = id;
    this.channel = channel;
    this.filters = filters;
    this.requestClose = requestClose;
  }

  get closed(): boolean {
    return this._closed;
  }

  override on<K extends keyof SubscriptionEvents<T>>(
    event: K,
    listener: (...args: SubscriptionEvents<T>[K]) => void,
  ): this;
  override on(event: string | symbol, listener: (...args: unknown[]) => void): this;
  override on(event: string | symbol, listener: (...args: unknown[]) => void): this {
    return super.on(event, listener);
  }

  override off<K extends keyof SubscriptionEvents<T>>(
    event: K,
    listener: (...args: SubscriptionEvents<T>[K]) => void,
  ): this;
  override off(event: string | symbol, listener: (...args: unknown[]) => void): this;
  override off(event: string | symbol, listener: (...args: unknown[]) => void): this {
    return super.off(event, listener);
  }

  override once<K extends keyof SubscriptionEvents<T>>(
    event: K,
    listener: (...args: SubscriptionEvents<T>[K]) => void,
  ): this;
  override once(event: string | symbol, listener: (...args: unknown[]) => void): this;
  override once(event: string | symbol, listener: (...args: unknown[]) => void): this {
    return super.once(event, listener);
  }

  /** Unsubscribe (if open), stop delivery, and drop from the reconnect-active map. */
  close(): void {
    if (this._closed) return;
    this._closed = true;
    this.requestClose(this);
    this.emit("close");
  }

  /** Internal: mark closed without sending unsubscribe (e.g. client shutdown). */
  markClosed(): void {
    if (this._closed) return;
    this._closed = true;
    this.emit("close");
  }
}
