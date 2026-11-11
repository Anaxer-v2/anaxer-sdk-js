import { afterEach, describe, expect, it } from "vitest";
import { connect, AnaxerError, type ConnectionLimits } from "../src/index";
import { MockStreamServer, waitFor } from "./mockServer";

describe("ws client", () => {
  let server: MockStreamServer;

  afterEach(async () => {
    await server?.close();
  });

  it("handshake: Bearer auth → connected → emits connected with connectionsPerStream", async () => {
    server = new MockStreamServer();
    const wsUrl = await server.listen();
    const client = connect({
      apiKey: "test-key",
      wsUrl,
      reconnect: false,
      heartbeatMs: 0,
    });

    const limits: ConnectionLimits = {
      connectionsPerStream: 1,
      tradesRequiresMints: true,
      tradesMintCap: 10,
      transfersRequiresFilter: true,
      transfersWalletCap: 25,
      transfersMintCap: 10,
    };
    const connectedP = new Promise<ConnectionLimits>((resolve) => {
      client.on("connected", resolve);
    });

    const readyP = client.ready();
    const { authorization } = await server.acceptAndConnect(limits);

    expect(authorization).toBe("Bearer test-key");
    await expect(readyP).resolves.toEqual(limits);
    await expect(connectedP).resolves.toEqual(limits);

    await client.close();
  });

  it("subscribe: well-formed frame, subscribed, data routed by sub id", async () => {
    server = new MockStreamServer();
    const wsUrl = await server.listen();
    const client = connect({
      apiKey: "k",
      wsUrl,
      reconnect: false,
      heartbeatMs: 0,
    });

    const sub = client.stream("trades", { sources: ["pump_fun"], minVolumeUsd: 10 });
    const acceptP = server.acceptAndConnect();
    const subscribeMsg = server.onceMessage((m) => m.type === "subscribe");
    await acceptP;

    const msg = await subscribeMsg;
    expect(msg).toMatchObject({
      type: "subscribe",
      id: sub.id,
      channel: "trades",
      filters: { sources: ["pump_fun"], minVolumeUsd: 10 },
    });
    expect(sub.id).toMatch(/^sub-\d+$/);

    const subscribedP = new Promise<unknown>((resolve) => {
      sub.on("subscribed", resolve);
    });
    server.send({
      v: 1,
      type: "subscribed",
      id: sub.id,
      channel: "trades",
      filters: msg.filters,
      ts: Date.now(),
    });
    await expect(subscribedP).resolves.toEqual(msg.filters);

    const dataP = new Promise<unknown>((resolve) => {
      sub.on("data", resolve);
    });
    const payload = {
      type: "swap",
      source: "pump_fun",
      wallet: "Wallet1111111111111111111111111111111",
      volumeUsd: 42,
      swap: {
        from: { mint: "MintA", symbol: "SOL", amount: "1", uiAmount: 1, decimals: 0 },
        to: { mint: "MintB", symbol: null, amount: "2", uiAmount: 2, decimals: 0 },
      },
      signature: "Sig",
      slot: 1,
      timestamp: Date.now(),
    };
    server.send({
      v: 1,
      channel: "trades",
      type: "swap",
      sub: sub.id,
      ts: Date.now(),
      data: payload,
    });
    await expect(dataP).resolves.toEqual(payload);

    let otherFired = false;
    sub.on("data", () => {
      otherFired = true;
    });
    server.send({
      v: 1,
      channel: "trades",
      type: "swap",
      sub: "sub-other",
      ts: Date.now(),
      data: payload,
    });
    await new Promise((r) => setTimeout(r, 30));
    expect(otherFired).toBe(false);

    await client.close();
  });

  it("old-shape connected frame (no transfers limits) still connects", async () => {
    server = new MockStreamServer();
    const wsUrl = await server.listen();
    const client = connect({ apiKey: "k", wsUrl, reconnect: false, heartbeatMs: 0 });
    let errored = false;
    client.on("error", () => {
      errored = true;
    });

    const readyP = client.ready();
    // A gateway from before the transfers channel: only the three trades-era fields,
    // plus an unknown field a future gateway might add.
    await server.acceptAndConnect({
      connectionsPerStream: 2,
      tradesRequiresMints: false,
      tradesMintCap: 100,
      someFutureLimit: 7,
    });
    const limits = await readyP;
    expect(limits).toEqual({
      connectionsPerStream: 2,
      tradesRequiresMints: false,
      tradesMintCap: 100,
    });
    expect(limits.transfersWalletCap).toBeUndefined();
    expect(errored).toBe(false);

    // And it still streams.
    const subscribeMsg = server.onceMessage((m) => m.type === "subscribe");
    const sub = client.stream("trades", { mints: ["Mint11111111111111111111111111111111"] });
    const msg = await subscribeMsg;
    expect(msg.id).toBe(sub.id);

    await client.close();
  });

  it("transfers: subscribe frame carries wallets/direction, transfer frames reach the sub", async () => {
    server = new MockStreamServer();
    const wsUrl = await server.listen();
    const client = connect({ apiKey: "k", wsUrl, reconnect: false, heartbeatMs: 0 });

    const wallet = "5G75aiNzTwpycR5c2AyfcYq2nxFLBYV4fyAjsTAeKihh";
    const sub = client.stream("transfers", {
      wallets: [wallet],
      direction: "out",
      minVolumeUsd: 1,
    });
    const subscribeMsg = server.onceMessage((m) => m.type === "subscribe");
    const [limits] = await Promise.all([client.ready(), server.acceptAndConnect()]);
    expect(limits.transfersRequiresFilter).toBe(false);
    expect(limits.transfersWalletCap).toBe(1000);
    expect(limits.transfersMintCap).toBe(100);

    const msg = await subscribeMsg;
    expect(msg).toEqual({
      type: "subscribe",
      id: sub.id,
      channel: "transfers",
      filters: { wallets: [wallet], direction: "out", minVolumeUsd: 1 },
    });

    const transfer = {
      type: "transfer",
      wallet,
      volumeUsd: 19.94,
      transfer: {
        from: wallet,
        to: "B4uQWmfRWzxfWWwUsXUGMuUYg4r3zmdHuaBdrFBbc3pE",
        mint: "So11111111111111111111111111111111111111112",
        symbol: "SOL",
        amount: "206376928",
        uiAmount: 0.206376928,
        decimals: 9,
      },
      signature: "Sig",
      slot: 463269930,
      timestamp: 1793360046000,
    };
    const dataP = new Promise<unknown>((resolve) => sub.on("data", resolve));
    server.send({
      v: 1,
      channel: "transfers",
      type: "transfer",
      sub: sub.id,
      ts: Date.now(),
      data: transfer,
    });
    await expect(dataP).resolves.toEqual(transfer);

    await client.close();
  });

  it("stream() before open queues and flushes on connected", async () => {
    server = new MockStreamServer();
    const wsUrl = await server.listen();
    const client = connect({
      apiKey: "k",
      wsUrl,
      reconnect: false,
      heartbeatMs: 0,
    });

    const sub = client.stream("creations", { excludeMayhem: true });
    expect(server.messages.filter((m) => m.type === "subscribe")).toHaveLength(0);

    const subscribeMsg = server.onceMessage((m) => m.type === "subscribe");
    await server.acceptAndConnect();
    const msg = await subscribeMsg;
    expect(msg).toMatchObject({
      type: "subscribe",
      id: sub.id,
      channel: "creations",
      filters: { excludeMayhem: true },
    });

    await client.close();
  });

  it("error{ id } routes to subscription; error without id to client; unauthorized is terminal", async () => {
    server = new MockStreamServer();
    const wsUrl = await server.listen();
    const client = connect({
      apiKey: "bad",
      wsUrl,
      reconnect: { baseDelayMs: 20, maxDelayMs: 50, maxRetries: 5 },
      heartbeatMs: 0,
    });

    const sub = client.stream("trades");
    await server.acceptAndConnect();
    await server.onceMessage((m) => m.type === "subscribe");

    const subErr = new Promise<AnaxerError>((resolve) => {
      sub.on("error", resolve);
    });
    server.send({
      v: 1,
      type: "error",
      code: "invalid_filters",
      message: "bad filters",
      id: sub.id,
      ts: Date.now(),
    });
    const e1 = await subErr;
    expect(e1.code).toBe("invalid_filters");
    expect(e1.subscriptionId).toBe(sub.id);

    const clientErr = new Promise<AnaxerError>((resolve) => {
      client.on("error", resolve);
    });
    server.send({
      v: 1,
      type: "error",
      code: "unauthorized",
      message: "bad key",
      ts: Date.now(),
    });
    const e2 = await clientErr;
    expect(e2.code).toBe("unauthorized");

    let reconnected = false;
    client.on("reconnect", () => {
      reconnected = true;
    });
    server.closeSocket(1008);
    await waitFor(() => client.listenerCount("close") >= 0);
    await new Promise((r) => setTimeout(r, 80));
    expect(reconnected).toBe(false);

    await client.close();
  });

  it("sub-scoped error with no subscription error listener falls back to client (no throw)", async () => {
    server = new MockStreamServer();
    const wsUrl = await server.listen();
    const client = connect({
      apiKey: "k",
      wsUrl,
      reconnect: false,
      heartbeatMs: 0,
    });

    // data-only listener — no sub.on("error")
    const sub = client.stream("trades");
    sub.on("data", () => {
      /* ignore */
    });

    await server.acceptAndConnect();
    await server.onceMessage((m) => m.type === "subscribe");

    const clientErr = new Promise<AnaxerError>((resolve) => {
      client.on("error", resolve);
    });
    server.send({
      v: 1,
      type: "error",
      code: "invalid_filters",
      message: "bad filters",
      id: sub.id,
      ts: Date.now(),
    });

    const err = await clientErr;
    expect(err.code).toBe("invalid_filters");
    expect(err.subscriptionId).toBe(sub.id);

    await client.close();
  });

  it("malformed connected frame surfaces error and rejects ready()", async () => {
    server = new MockStreamServer();
    const wsUrl = await server.listen();
    const client = connect({
      apiKey: "k",
      wsUrl,
      reconnect: false,
      heartbeatMs: 0,
    });

    const readyP = client.ready();
    const errP = new Promise<AnaxerError>((resolve) => {
      client.on("error", resolve);
    });

    await new Promise<void>((resolve) => {
      server.onceConnection(() => resolve());
    });
    // Intentionally omit limits.connectionsPerStream
    server.send({ v: 1, type: "connected", ts: Date.now(), limits: {} });

    const err = await errP;
    expect(err.code).toBe("internal_error");
    await expect(readyP).rejects.toMatchObject({ code: "internal_error" });

    await client.close();
  });

  it("subscription.close() sends unsubscribe and is not re-sent after reconnect", async () => {
    server = new MockStreamServer();
    const wsUrl = await server.listen();
    const client = connect({
      apiKey: "k",
      wsUrl,
      reconnect: { baseDelayMs: 20, maxDelayMs: 50 },
      heartbeatMs: 0,
    });

    const keep = client.stream("trades", { sources: ["pump_fun"] });
    const drop = client.stream("prices", { mints: ["Mint1111111111111111111111111111111"] });

    await server.acceptAndConnect();
    await waitFor(
      () => server.messages.filter((m) => m.type === "subscribe").length >= 2,
    );

    const unsubP = server.onceMessage((m) => m.type === "unsubscribe" && m.id === drop.id);
    drop.close();
    await expect(unsubP).resolves.toMatchObject({ type: "unsubscribe", id: drop.id });

    // Kill and bring back a new server on the same... we need reconnect to same URL.
    // Close socket; server stays listening for the reconnect.
    server.messages.length = 0;
    const reconnectP = new Promise<number>((resolve) => {
      client.once("reconnect", resolve);
    });
    server.closeSocket(1001);
    await expect(reconnectP).resolves.toBe(1);

    // New connection on same WSS
    const auth = server.acceptAndConnect();
    const subscribes: unknown[] = [];
    const collect = (msg: { type: string }) => {
      if (msg.type === "subscribe") subscribes.push(msg);
    };
    // acceptAndConnect waits for connection then sends connected; collect after
    await auth;
    await waitFor(() => server.messages.some((m) => m.type === "subscribe"));
    for (const m of server.messages) collect(m);

    const subscribeIds = server.messages
      .filter((m) => m.type === "subscribe")
      .map((m) => m.id);
    expect(subscribeIds).toContain(keep.id);
    expect(subscribeIds).not.toContain(drop.id);

    await client.close();
  });
});
