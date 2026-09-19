import { EventEmitter } from "node:events";
import type { SubscriptionFiltersV1 } from "../types";
import { AnaxerError, type AnaxerErrorCode } from "../errors";
import {
  reconnectDelayMs,
  type ReconnectConfig,
  type ResolvedClientConfig,
} from "../config";
import { createSocket, type CreateSocket, type Socket } from "./socket";
import { Subscription, type StreamChannel } from "./subscription";

export type ConnectionState = "idle" | "connecting" | "open" | "reconnecting" | "closed";

export interface ConnectionLimits {
  connectionsPerStream: number;
  tradesRequiresMints: boolean;
  tradesMintCap: number;
}

type ReadyWaiter = {
  resolve: (limits: ConnectionLimits) => void;
  reject: (err: AnaxerError) => void;
};

/**
 * WS lifecycle: connect + auth, `connected` gating, subscribe queue/flush, heartbeat,
 * reconnect with resubscribe, error routing (doc 22 §4.3).
 */
export class WsConnection extends EventEmitter {
  private state: ConnectionState = "idle";
  private socket: Socket | null = null;
  private readonly subscriptions = new Map<string, Subscription>();
  private subSeq = 0;
  private limits: ConnectionLimits | null = null;
  private readyWaiters: ReadyWaiter[] = [];
  private terminal = false;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private lastInboundAt = 0;
  private intentionalClose = false;

  constructor(
    private readonly config: ResolvedClientConfig,
    private readonly createSocketFn: CreateSocket = createSocket,
  ) {
    super();
  }

  get connectionState(): ConnectionState {
    return this.state;
  }

  stream<T>(channel: StreamChannel, filters?: SubscriptionFiltersV1): Subscription<T> {
    if (this.state === "closed") {
      throw new AnaxerError(
        this.terminal ? "unauthorized" : "connection_closed",
        this.terminal ? "Client is closed after terminal auth failure" : "Client is closed",
      );
    }

    const id = `sub-${++this.subSeq}`;
    const resolvedFilters: SubscriptionFiltersV1 = filters ?? {};
    const sub = new Subscription<T>(id, channel, resolvedFilters, (s) => {
      this.handleSubscriptionClose(s);
    });
    this.subscriptions.set(id, sub as Subscription);
    this.ensureConnected();
    if (this.state === "open") {
      this.sendSubscribe(sub);
    }
    // else: queued — flushed on `connected`
    return sub;
  }

  ready(): Promise<ConnectionLimits> {
    if (this.state === "open" && this.limits) {
      return Promise.resolve(this.limits);
    }
    if (this.state === "closed") {
      return Promise.reject(
        new AnaxerError(
          this.terminal ? "unauthorized" : "connection_closed",
          this.terminal ? "Connection closed (unauthorized)" : "Client is closed",
        ),
      );
    }
    this.ensureConnected();
    return new Promise<ConnectionLimits>((resolve, reject) => {
      this.readyWaiters.push({ resolve, reject });
    });
  }

  async close(): Promise<void> {
    this.intentionalClose = true;
    this.terminal = false;
    this.clearReconnectTimer();
    this.stopHeartbeat();
    this.rejectReadyWaiters(new AnaxerError("connection_closed", "Client closed"));

    for (const sub of [...this.subscriptions.values()]) {
      if (!sub.closed) {
        if (this.state === "open") {
          this.sendRaw({ type: "unsubscribe", id: sub.id });
        }
        this.subscriptions.delete(sub.id);
        sub.markClosed();
      }
    }

    const sock = this.socket;
    this.socket = null;
    this.state = "closed";
    if (sock) {
      await new Promise<void>((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          resolve();
        };
        sock.onClose(() => finish());
        try {
          sock.close(1000);
        } catch {
          finish();
        }
        setTimeout(finish, 500);
      });
    }
    this.emit("close");
  }

  private handleSubscriptionClose(sub: Subscription): void {
    if (this.subscriptions.has(sub.id)) {
      if (this.state === "open") {
        this.sendRaw({ type: "unsubscribe", id: sub.id });
      }
      this.subscriptions.delete(sub.id);
    }
  }

  private ensureConnected(): void {
    if (
      this.state === "connecting" ||
      this.state === "open" ||
      this.state === "reconnecting" ||
      this.state === "closed"
    ) {
      return;
    }
    void this.openSocket();
  }

  private async openSocket(): Promise<void> {
    if (this.state === "closed" && this.intentionalClose) return;
    if (this.terminal) return;

    this.state = this.reconnectAttempt > 0 ? "reconnecting" : "connecting";

    const sock = this.createSocketFn(this.config.wsUrl, {
      Authorization: `Bearer ${this.config.apiKey}`,
    });
    this.socket = sock;

    sock.onOpen(() => {
      // Wait for server `connected` before flushing subscribes.
    });

    sock.onMessage((raw) => {
      this.lastInboundAt = Date.now();
      this.dispatchMessage(raw);
    });

    sock.onError((err) => {
      if (this.intentionalClose || this.state === "closed" || this.terminal) return;
      this.emit(
        "error",
        new AnaxerError("internal_error", err.message || "WebSocket error"),
      );
    });

    sock.onClose((code, reason) => {
      this.onSocketClosed(code, reason);
    });
  }

  private dispatchMessage(raw: string): void {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }

    const type = msg.type;
    if (type === "connected") {
      this.onConnected(msg);
      return;
    }
    if (type === "subscribed") {
      const id = String(msg.id ?? "");
      const sub = this.subscriptions.get(id);
      if (sub) {
        sub.emit("subscribed", (msg.filters ?? {}) as SubscriptionFiltersV1);
      }
      return;
    }
    if (type === "pong") {
      return;
    }
    if (type === "error") {
      this.onServerError(msg);
      return;
    }
    if (type === "unsubscribed") {
      return;
    }

    // Data frame: v:1 + channel + sub
    if (msg.v === 1 && typeof msg.channel === "string" && typeof msg.sub === "string") {
      const sub = this.subscriptions.get(msg.sub);
      if (sub) {
        sub.emit("data", msg.data);
      }
    }
  }

  private onConnected(msg: Record<string, unknown>): void {
    const limitsObj = msg.limits as
      | {
          connectionsPerStream?: number;
          tradesRequiresMints?: boolean;
          tradesMintCap?: number;
        }
      | undefined;
    const connectionsPerStream = limitsObj?.connectionsPerStream;
    const tradesRequiresMints = limitsObj?.tradesRequiresMints;
    const tradesMintCap = limitsObj?.tradesMintCap;
    if (
      typeof connectionsPerStream !== "number" ||
      !Number.isFinite(connectionsPerStream) ||
      typeof tradesRequiresMints !== "boolean" ||
      typeof tradesMintCap !== "number" ||
      !Number.isFinite(tradesMintCap)
    ) {
      const err = new AnaxerError(
        "internal_error",
        "Malformed connected frame: missing limits.connectionsPerStream / tradesRequiresMints / tradesMintCap",
      );
      this.emit("error", err);
      this.rejectReadyWaiters(err);
      try {
        this.socket?.close(4000);
      } catch {
        /* reconnect / close path handles a dead socket */
      }
      return;
    }
    this.limits = { connectionsPerStream, tradesRequiresMints, tradesMintCap };
    this.state = "open";
    this.reconnectAttempt = 0;
    this.startHeartbeat();
    this.flushSubscriptions();
    this.emit("connected", this.limits);
    this.emit("open");
    for (const w of this.readyWaiters.splice(0)) {
      w.resolve(this.limits);
    }
  }

  private onServerError(msg: Record<string, unknown>): void {
    const code = String(msg.code ?? "internal_error") as AnaxerErrorCode;
    const message = String(msg.message ?? code);
    const id = typeof msg.id === "string" ? msg.id : undefined;
    const err = new AnaxerError(code, message, { subscriptionId: id });

    if (id) {
      const sub = this.subscriptions.get(id);
      if (sub && sub.listenerCount("error") > 0) {
        sub.emit("error", err);
      } else {
        // No sub error listener — never let EventEmitter throw; surface on connection.
        this.emit("error", err);
      }
    } else {
      // Connection-level — emit before any reconnect path (§3a Q5).
      this.emit("error", err);
    }

    if (code === "unauthorized") {
      this.terminal = true;
    }
  }

  private onSocketClosed(_code: number, _reason: string): void {
    this.stopHeartbeat();
    this.socket = null;

    if (this.intentionalClose || this.state === "closed") {
      this.state = "closed";
      return;
    }

    if (this.terminal) {
      this.state = "closed";
      this.rejectReadyWaiters(
        new AnaxerError("unauthorized", "Connection closed (unauthorized)"),
      );
      this.emit("close");
      return;
    }

    const reconnect = this.config.reconnect;
    if (reconnect === false) {
      this.state = "closed";
      this.rejectReadyWaiters(new AnaxerError("connection_closed", "Connection closed"));
      this.emit("close");
      return;
    }

    // Transient close — emit close then schedule reconnect (§4.3).
    this.emit("close");
    this.scheduleReconnect(reconnect);
  }

  private scheduleReconnect(reconnect: Exclude<ReconnectConfig, false>): void {
    if (this.intentionalClose || this.terminal) return;

    const nextAttempt = this.reconnectAttempt + 1;
    if (reconnect.maxRetries !== null && nextAttempt > reconnect.maxRetries) {
      this.state = "closed";
      this.rejectReadyWaiters(
        new AnaxerError("connection_closed", "Max reconnect retries exceeded"),
      );
      return;
    }

    this.reconnectAttempt = nextAttempt;
    this.state = "reconnecting";
    this.emit("reconnect", nextAttempt);
    const delay = reconnectDelayMs(nextAttempt, reconnect);
    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.openSocket();
    }, delay);
  }

  private flushSubscriptions(): void {
    for (const sub of this.subscriptions.values()) {
      if (!sub.closed) {
        this.sendSubscribe(sub);
      }
    }
  }

  private sendSubscribe(sub: Subscription): void {
    this.sendRaw({
      type: "subscribe",
      id: sub.id,
      channel: sub.channel,
      filters: sub.filters,
    });
  }

  private sendRaw(payload: unknown): void {
    if (!this.socket || this.state !== "open") return;
    try {
      this.socket.send(JSON.stringify(payload));
    } catch {
      // Socket may race-close; reconnect path will handle.
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    const ms = this.config.heartbeatMs;
    if (ms <= 0) return;
    this.lastInboundAt = Date.now();
    this.heartbeatTimer = setInterval(() => {
      if (this.state !== "open" || !this.socket) return;
      this.sendRaw({ type: "ping" });
      const staleMs = Date.now() - this.lastInboundAt;
      if (staleMs > ms * 2) {
        // Force-close → reconnect path (decision 8).
        try {
          this.socket.close(4000);
        } catch {
          this.onSocketClosed(4000, "heartbeat timeout");
        }
      }
    }, ms);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private rejectReadyWaiters(err: AnaxerError): void {
    for (const w of this.readyWaiters.splice(0)) {
      w.reject(err);
    }
  }
}
