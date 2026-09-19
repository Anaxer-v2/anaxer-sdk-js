import { afterEach, describe, expect, it } from "vitest";
import { connect, AnaxerError } from "../src/index";
import { MockStreamServer, waitFor } from "./mockServer";

describe("reconnect + heartbeat", () => {
  let server: MockStreamServer;

  afterEach(async () => {
    await server?.close();
  });

  it("reconnects with backoff, re-sends active subscribe frames with same ids", async () => {
    server = new MockStreamServer();
    const wsUrl = await server.listen();
    const client = connect({
      apiKey: "k",
      wsUrl,
      reconnect: { baseDelayMs: 30, maxDelayMs: 100 },
      heartbeatMs: 0,
    });

    const a = client.stream("trades", { sources: ["pump_fun"] });
    const b = client.stream("creations", { excludeMayhem: true });

    await server.acceptAndConnect();
    await waitFor(
      () => server.messages.filter((m) => m.type === "subscribe").length >= 2,
    );
    const firstIds = server.messages
      .filter((m) => m.type === "subscribe")
      .map((m) => m.id)
      .sort();
    expect(firstIds).toEqual([a.id, b.id].sort());

    server.messages.length = 0;
    const reconnectP = new Promise<number>((resolve) => {
      client.once("reconnect", resolve);
    });
    server.closeSocket(1001);
    await expect(reconnectP).resolves.toBe(1);

    await server.acceptAndConnect();
    await waitFor(
      () => server.messages.filter((m) => m.type === "subscribe").length >= 2,
    );
    const secondIds = server.messages
      .filter((m) => m.type === "subscribe")
      .map((m) => m.id)
      .sort();
    expect(secondIds).toEqual([a.id, b.id].sort());

    const filtersById = Object.fromEntries(
      server.messages
        .filter((m) => m.type === "subscribe")
        .map((m) => [m.id, m.filters]),
    );
    expect(filtersById[a.id]).toEqual({ sources: ["pump_fun"] });
    expect(filtersById[b.id]).toEqual({ excludeMayhem: true });

    await client.close();
  });

  it("reconnect: false does not reconnect", async () => {
    server = new MockStreamServer();
    const wsUrl = await server.listen();
    const client = connect({
      apiKey: "k",
      wsUrl,
      reconnect: false,
      heartbeatMs: 0,
    });

    client.stream("trades");
    await server.acceptAndConnect();
    await server.onceMessage((m) => m.type === "subscribe");

    let reconnected = false;
    client.on("reconnect", () => {
      reconnected = true;
    });
    const closeP = new Promise<void>((resolve) => {
      client.once("close", () => resolve());
    });
    server.closeSocket(1001);
    await closeP;
    await new Promise((r) => setTimeout(r, 60));
    expect(reconnected).toBe(false);

    await client.close();
  });

  it("heartbeat timeout (no inbound within 2×heartbeatMs) forces reconnect", async () => {
    server = new MockStreamServer();
    const wsUrl = await server.listen();
    const client = connect({
      apiKey: "k",
      wsUrl,
      reconnect: { baseDelayMs: 20, maxDelayMs: 50 },
      heartbeatMs: 40,
    });

    client.stream("trades");
    await server.acceptAndConnect();
    await server.onceMessage((m) => m.type === "subscribe");

    // Do not reply to pings or send any traffic — wait for liveness kill.
    const reconnectP = new Promise<number>((resolve) => {
      client.once("reconnect", resolve);
    });
    await expect(reconnectP).resolves.toBe(1);

    // Accept the reconnect so the client can settle before close.
    await server.acceptAndConnect();
    await client.close();
  }, 5000);

  it("slow_consumer: emit error with code before reconnect (not terminal)", async () => {
    server = new MockStreamServer();
    const wsUrl = await server.listen();
    const client = connect({
      apiKey: "k",
      wsUrl,
      reconnect: { baseDelayMs: 20, maxDelayMs: 50 },
      heartbeatMs: 0,
    });

    client.stream("trades");
    await server.acceptAndConnect();
    await server.onceMessage((m) => m.type === "subscribe");

    const order: string[] = [];
    client.on("error", (err: AnaxerError) => {
      order.push(`error:${err.code}`);
    });
    client.on("reconnect", (attempt: number) => {
      order.push(`reconnect:${attempt}`);
    });

    server.send({
      v: 1,
      type: "error",
      code: "slow_consumer",
      message: "buffer exceeded",
      ts: Date.now(),
    });
    server.closeSocket(1008);

    await waitFor(() => order.includes("reconnect:1"));
    expect(order[0]).toBe("error:slow_consumer");
    expect(order).toContain("reconnect:1");
    const errIdx = order.indexOf("error:slow_consumer");
    const recIdx = order.indexOf("reconnect:1");
    expect(errIdx).toBeLessThan(recIdx);

    await server.acceptAndConnect();
    await client.close();
  });
});
