import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { AnaxerError, connect } from "../src/index";

type Handler = (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
) => void | Promise<void>;

class MockHttpServer {
  private server: http.Server | null = null;
  handler: Handler = (_req, res) => {
    res.writeHead(404);
    res.end();
  };
  requests: { method?: string; path: string; auth?: string; search: string }[] = [];

  async listen(): Promise<string> {
    this.server = http.createServer((req, res) => {
      const host = req.headers.host ?? "127.0.0.1";
      const url = new URL(req.url ?? "/", `http://${host}`);
      this.requests.push({
        method: req.method,
        path: url.pathname,
        auth: req.headers.authorization,
        search: url.search,
      });
      void Promise.resolve(this.handler(req, res, url)).catch(() => {
        res.writeHead(500);
        res.end();
      });
    });
    await new Promise<void>((resolve) => {
      this.server!.listen(0, "127.0.0.1", () => resolve());
    });
    const addr = this.server.address() as AddressInfo;
    return `http://127.0.0.1:${addr.port}`;
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close((err) => (err ? reject(err) : resolve()));
      this.server = null;
    });
  }
}

function json(res: http.ServerResponse, status: number, body: unknown, headers?: Record<string, string>) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    ...headers,
  });
  res.end(payload);
}

describe("rest client", () => {
  let server: MockHttpServer;

  afterEach(async () => {
    await server?.close();
  });

  it("attaches Authorization: Bearer on every call", async () => {
    server = new MockHttpServer();
    const baseUrl = await server.listen();
    server.handler = (_req, res) => {
      json(res, 200, {
        mint: "M",
        name: null,
        symbol: null,
        supply: null,
        socials: { website: null, twitter: null, telegram: null },
      });
    };

    const client = connect({ apiKey: "secret-key", baseUrl, reconnect: false, heartbeatMs: 0 });
    await client.tokens.get("Mint11111111111111111111111111111111");
    expect(server.requests[0]?.auth).toBe("Bearer secret-key");
    expect(server.requests[0]?.path).toMatch(/^\/v1\/tokens\//);
  });

  it("tokens.get 404 throws AnaxerError not_found", async () => {
    server = new MockHttpServer();
    const baseUrl = await server.listen();
    server.handler = (_req, res) => {
      json(res, 404, { error: { code: "not_found", message: "Unknown token" } });
    };

    const client = connect({ apiKey: "k", baseUrl, reconnect: false, heartbeatMs: 0 });
    await expect(client.tokens.get("MissingMint1111111111111111111111111")).rejects.toMatchObject({
      code: "not_found",
      status: 404,
    });
  });

  it("batch unwraps { data } → T[]", async () => {
    server = new MockHttpServer();
    const baseUrl = await server.listen();
    server.handler = (_req, res) => {
      json(res, 200, {
        data: [
          {
            mint: "A",
            name: "A",
            symbol: "A",
            supply: "1",
            socials: { website: null, twitter: null, telegram: null },
          },
        ],
      });
    };

    const client = connect({ apiKey: "k", baseUrl, reconnect: false, heartbeatMs: 0 });
    const rows = await client.tokens.batch(["A"]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.mint).toBe("A");
    expect(Array.isArray(rows)).toBe(true);
  });

  it("tokens.trades forwards solOnly=true on the query string", async () => {
    server = new MockHttpServer();
    const baseUrl = await server.listen();
    server.handler = (_req, res) => {
      json(res, 200, { data: [], next: null, window: { from: 1, to: 2 } });
    };

    const client = connect({ apiKey: "k", baseUrl, reconnect: false, heartbeatMs: 0 });
    await client.tokens.trades("TokenMint1111111111111111111111111111111", {
      limit: 10,
      solOnly: true,
    });
    expect(server.requests[0]?.search).toContain("solOnly=true");
  });

  it("tokens.trades joins sources and forwards size bounds", async () => {
    server = new MockHttpServer();
    const baseUrl = await server.listen();
    server.handler = (_req, res) => {
      json(res, 200, { data: [], next: null, window: { from: 1, to: 2 } });
    };

    const client = connect({ apiKey: "k", baseUrl, reconnect: false, heartbeatMs: 0 });
    await client.tokens.trades("TokenMint1111111111111111111111111111111", {
      sources: ["pump_fun", "pump_amm"],
      minVolumeUsd: 100,
      maxVolumeUsd: 5000,
    });
    const q = new URLSearchParams(server.requests[0]?.search);
    expect(q.get("sources")).toBe("pump_fun,pump_amm");
    expect(q.get("source")).toBeNull();
    expect(q.get("minVolumeUsd")).toBe("100");
    expect(q.get("maxVolumeUsd")).toBe("5000");
  });

  it("source and sources together reject without a request", async () => {
    server = new MockHttpServer();
    const baseUrl = await server.listen();
    const client = connect({ apiKey: "k", baseUrl, reconnect: false, heartbeatMs: 0 });
    const opts = { source: "pump_fun", sources: ["pump_amm"] } as unknown as { source: string };
    await expect(client.creations(opts)).rejects.toMatchObject({ code: "invalid_request" });
    await expect(client.graduations(opts)).rejects.toMatchObject({ code: "invalid_request" });
    expect(server.requests).toHaveLength(0);
  });

  it("creations/graduations send sources as a comma list", async () => {
    server = new MockHttpServer();
    const baseUrl = await server.listen();
    server.handler = (_req, res) => {
      json(res, 200, { data: [], next: null, window: { from: 1, to: 2 } });
    };
    const client = connect({ apiKey: "k", baseUrl, reconnect: false, heartbeatMs: 0 });
    await client.creations({ sources: ["pump_fun", "raydium_launchlab"] });
    await client.graduations({ sources: ["pump_fun"], minLiquiditySol: 50 });
    expect(new URLSearchParams(server.requests[0]?.search).get("sources")).toBe(
      "pump_fun,raydium_launchlab",
    );
    const g = new URLSearchParams(server.requests[1]?.search);
    expect(g.get("sources")).toBe("pump_fun");
    expect(g.get("minLiquiditySol")).toBe("50");
  });

  it("wallets.trades hits /v1/wallets/:wallet/trades with mints, sources, size, solOnly", async () => {
    server = new MockHttpServer();
    const baseUrl = await server.listen();
    const swap = {
      type: "swap",
      source: "pump_fun",
      wallet: "W",
      volumeUsd: 1,
      swap: {
        from: {
          mint: "So11111111111111111111111111111111111111112",
          symbol: "SOL",
          amount: "1",
          uiAmount: 1e-9,
          decimals: 9,
        },
        to: { mint: "M", symbol: null, amount: "2", uiAmount: 2, decimals: 0 },
      },
      signature: "s",
      slot: 1,
      timestamp: 1,
    };
    server.handler = (_req, res) => {
      json(res, 200, { data: [swap], next: null, window: { from: 1, to: 2 } });
    };
    const client = connect({ apiKey: "k", baseUrl, reconnect: false, heartbeatMs: 0 });
    const wallet = "8gM4gnxdLdkvifM9TCwkGAxrnNw4NiSiHbAdE1RqY96e";
    const page = await client.wallets.trades(wallet, {
      mints: ["MintA1111111111111111111111111111111", "MintB1111111111111111111111111111111"],
      sources: ["pump_fun"],
      solOnly: true,
      minVolumeUsd: 5,
      limit: 10,
    });
    expect(page.data[0]?.swap.from.symbol).toBe("SOL");
    expect(page.data[0]?.swap.to.symbol).toBeNull();
    expect(server.requests[0]?.path).toBe("/v1/wallets/" + wallet + "/trades");
    const q = new URLSearchParams(server.requests[0]?.search);
    expect(q.get("mints")).toBe(
      "MintA1111111111111111111111111111111,MintB1111111111111111111111111111111",
    );
    expect(q.get("sources")).toBe("pump_fun");
    expect(q.get("solOnly")).toBe("true");
    expect(q.get("minVolumeUsd")).toBe("5");
    expect(q.get("limit")).toBe("10");
  });

  it("wallets.transfers sends direction/mints/size and walks next on the same endpoint", async () => {
    server = new MockHttpServer();
    const baseUrl = await server.listen();
    const transfer = (sig: string) => ({
      type: "transfer",
      wallet: "W",
      volumeUsd: null,
      transfer: { from: "W", to: "X", mint: "M", symbol: null, amount: "1", uiAmount: 1, decimals: 0 },
      signature: sig,
      slot: 1,
      timestamp: 1,
    });
    let hits = 0;
    server.handler = (_req, res, url) => {
      hits += 1;
      if (hits === 1) {
        json(res, 200, { data: [transfer("a")], next: "c2", window: { from: 1, to: 2 } });
        return;
      }
      expect(url.searchParams.get("cursor")).toBe("c2");
      json(res, 200, { data: [transfer("b")], next: null, window: { from: 1, to: 2 } });
    };
    const client = connect({ apiKey: "k", baseUrl, reconnect: false, heartbeatMs: 0 });
    const page = await client.wallets.transfers("W", {
      direction: "in",
      mints: ["So11111111111111111111111111111111111111112"],
      maxVolumeUsd: 1000,
    });
    const sigs: string[] = [];
    for await (const t of page) sigs.push(t.signature);
    expect(sigs).toEqual(["a", "b"]);
    expect(server.requests.every((r) => r.path === "/v1/wallets/W/transfers")).toBe(true);
    const q = new URLSearchParams(server.requests[1]?.search);
    expect(q.get("direction")).toBe("in");
    expect(q.get("mints")).toBe("So11111111111111111111111111111111111111112");
    expect(q.get("maxVolumeUsd")).toBe("1000");
  });

  it("path params are URL-encoded", async () => {
    server = new MockHttpServer();
    const baseUrl = await server.listen();
    server.handler = (_req, res) => {
      json(res, 200, { data: [], next: null, window: { from: 1, to: 2 } });
    };
    const client = connect({ apiKey: "k", baseUrl, reconnect: false, heartbeatMs: 0 });
    await client.wallets.trades("a/b?c");
    await client.wallets.transfers("a/b?c");
    expect(server.requests[0]?.path).toBe("/v1/wallets/a%2Fb%3Fc/trades");
    expect(server.requests[1]?.path).toBe("/v1/wallets/a%2Fb%3Fc/transfers");
  });

  it("creations() Page async-iterates across next until null", async () => {
    server = new MockHttpServer();
    const baseUrl = await server.listen();
    let page = 0;
    server.handler = (_req, res, url) => {
      page += 1;
      if (page === 1) {
        expect(url.searchParams.get("cursor")).toBeNull();
        json(res, 200, {
          data: [{ type: "created", mint: "m1", signature: "s1", slot: 1, timestamp: 1, source: "pump_fun", creator: "c", name: null, symbol: null, uri: null, mayhemMode: false, socials: { website: null, twitter: null, telegram: null } }],
          next: "cursor-page-2",
          window: { from: 1, to: 2 },
        });
        return;
      }
      expect(url.searchParams.get("cursor")).toBe("cursor-page-2");
      json(res, 200, {
        data: [{ type: "created", mint: "m2", signature: "s2", slot: 2, timestamp: 2, source: "pump_fun", creator: "c", name: null, symbol: null, uri: null, mayhemMode: false, socials: { website: null, twitter: null, telegram: null } }],
        next: null,
        window: { from: 1, to: 2 },
      });
    };

    const client = connect({ apiKey: "k", baseUrl, reconnect: false, heartbeatMs: 0 });
    const first = await client.creations({ limit: 1 });
    expect(first.data).toHaveLength(1);
    expect(first.next).toBe("cursor-page-2");

    const mints: string[] = [];
    for await (const row of first) {
      if (row.mint) mints.push(row.mint);
    }
    expect(mints).toEqual(["m1", "m2"]);
    expect(server.requests.every((r) => r.path === "/v1/creations")).toBe(true);
  });

  it("429 with retry-after is retried then throws rate_limited", async () => {
    server = new MockHttpServer();
    const baseUrl = await server.listen();
    let hits = 0;
    server.handler = (_req, res) => {
      hits += 1;
      json(
        res,
        429,
        { error: { code: "rate_limited", message: "slow down" } },
        { "retry-after": "0" },
      );
    };

    const client = connect({
      apiKey: "k",
      baseUrl,
      reconnect: false,
      heartbeatMs: 0,
      restMaxRetries: 2,
    });

    await expect(client.tokens.price("Mint11111111111111111111111111111111")).rejects.toMatchObject({
      code: "rate_limited",
      status: 429,
    });
    // 1 initial + 2 retries
    expect(hits).toBe(3);
  });

  it("5xx is retried; 400 invalid_request throws immediately", async () => {
    server = new MockHttpServer();
    const baseUrl = await server.listen();

    let hits5xx = 0;
    server.handler = (_req, res) => {
      hits5xx += 1;
      json(res, 503, {
        error: { code: "upstream_unavailable", message: "down" },
      });
    };
    const client = connect({
      apiKey: "k",
      baseUrl,
      reconnect: false,
      heartbeatMs: 0,
      restMaxRetries: 1,
    });
    await expect(client.launchpads.stats()).rejects.toMatchObject({
      code: "upstream_unavailable",
      status: 503,
    });
    expect(hits5xx).toBe(2);

    let hits400 = 0;
    server.handler = (_req, res) => {
      hits400 += 1;
      json(res, 400, {
        error: { code: "invalid_request", message: "bad cursor" },
      });
    };
    await expect(client.creations({ cursor: "nope" })).rejects.toBeInstanceOf(AnaxerError);
    await expect(client.creations({ cursor: "nope" })).rejects.toMatchObject({
      code: "invalid_request",
      status: 400,
    });
    expect(hits400).toBe(2); // two separate calls, no retries each
  });
});
