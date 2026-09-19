import WebSocket from "ws";

export interface Socket {
  send(data: string): void;
  close(code?: number): void;
  onOpen(cb: () => void): void;
  onMessage(cb: (data: string) => void): void;
  onClose(cb: (code: number, reason: string) => void): void;
  onError(cb: (err: Error) => void): void;
}

/**
 * Sole import site for the `ws` package (doc 22 §4.4). A future browser build swaps
 * this for global `WebSocket` (+ `?apiKey=` query, since browsers cannot set WS headers).
 */
export function createSocket(url: string, headers: Record<string, string>): Socket {
  const ws = new WebSocket(url, { headers });

  return {
    send(data: string) {
      ws.send(data);
    },
    close(code?: number) {
      ws.close(code);
    },
    onOpen(cb) {
      ws.on("open", cb);
    },
    onMessage(cb) {
      ws.on("message", (data) => {
        cb(typeof data === "string" ? data : data.toString());
      });
    },
    onClose(cb) {
      ws.on("close", (code, reason) => {
        cb(code, reason.toString());
      });
    },
    onError(cb) {
      ws.on("error", (err) => {
        cb(err instanceof Error ? err : new Error(String(err)));
      });
    },
  };
}

export type CreateSocket = typeof createSocket;
