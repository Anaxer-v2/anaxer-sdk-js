import { EventEmitter } from "node:events";
import type { AddressInfo } from "node:net";
import { WebSocketServer, type WebSocket } from "ws";

export type MockClientMessage = {
  type: string;
  id?: string;
  channel?: string;
  filters?: Record<string, unknown>;
};

export class MockStreamServer {
  private wss: WebSocketServer | null = null;
  private socket: WebSocket | null = null;
  readonly messages: MockClientMessage[] = [];
  private readonly bus = new EventEmitter();

  async listen(): Promise<string> {
    this.wss = new WebSocketServer({ port: 0, host: "127.0.0.1" });
    await new Promise<void>((resolve) => this.wss!.once("listening", () => resolve()));
    this.wss.on("connection", (ws, req) => {
      this.socket = ws;
      this.bus.emit("connection", ws, req);
      ws.on("message", (data) => {
        const msg = JSON.parse(data.toString()) as MockClientMessage;
        this.messages.push(msg);
        this.bus.emit("message", msg);
      });
    });
    const addr = this.wss.address() as AddressInfo;
    return `ws://127.0.0.1:${addr.port}`;
  }

  onConnection(cb: (ws: WebSocket, req: import("node:http").IncomingMessage) => void): void {
    this.bus.on("connection", cb);
  }

  onceConnection(
    cb: (ws: WebSocket, req: import("node:http").IncomingMessage) => void,
  ): void {
    this.bus.once("connection", cb);
  }

  onceMessage(predicate?: (msg: MockClientMessage) => boolean): Promise<MockClientMessage> {
    return new Promise((resolve) => {
      const handler = (msg: MockClientMessage) => {
        if (!predicate || predicate(msg)) {
          this.bus.off("message", handler);
          resolve(msg);
        }
      };
      this.bus.on("message", handler);
    });
  }

  send(payload: unknown): void {
    if (!this.socket || this.socket.readyState !== this.socket.OPEN) {
      throw new Error("MockStreamServer: no open client socket");
    }
    this.socket.send(JSON.stringify(payload));
  }

  /** Speak the v1 handshake: wait for connection, send `connected`. */
  async acceptAndConnect(
    limits = {
      connectionsPerStream: 2,
      tradesRequiresMints: false,
      tradesMintCap: 100,
    },
  ): Promise<{
    authorization: string | undefined;
  }> {
    const { req } = await new Promise<{
      ws: WebSocket;
      req: import("node:http").IncomingMessage;
    }>((resolve) => {
      this.onceConnection((ws, req) => resolve({ ws, req }));
    });
    const authorization = req.headers.authorization;
    this.send({
      v: 1,
      type: "connected",
      ts: Date.now(),
      limits,
    });
    return { authorization };
  }

  closeSocket(code = 1000): void {
    this.socket?.close(code);
  }

  async close(): Promise<void> {
    this.socket?.terminate();
    this.socket = null;
    await new Promise<void>((resolve) => {
      if (!this.wss) {
        resolve();
        return;
      }
      this.wss.close(() => resolve());
      this.wss = null;
    });
  }
}

export function waitFor(
  predicate: () => boolean,
  timeoutMs = 2000,
  intervalMs = 10,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (predicate()) {
        resolve();
        return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`waitFor timed out after ${timeoutMs}ms`));
        return;
      }
      setTimeout(tick, intervalMs);
    };
    tick();
  });
}
