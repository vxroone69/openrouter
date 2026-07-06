import { describe, expect, test } from "bun:test";
import { aggregateSnapshot, classifyErrorTypeFromMessage, getDefaultInterval } from "./service";

describe("analytics helpers", () => {
  test("classifies provider errors", () => {
    expect(classifyErrorTypeFromMessage("Request timed out after 30s")).toBe("timeout");
    expect(classifyErrorTypeFromMessage("429 You exceeded your current quota")).toBe("rate_limit");
    expect(classifyErrorTypeFromMessage("503 service unavailable")).toBe("provider_5xx");
    expect(classifyErrorTypeFromMessage("No providers mapped for this model")).toBe("invalid_request");
  });

  test("chooses the default interval by range", () => {
    expect(getDefaultInterval("24h")).toBe("hour");
    expect(getDefaultInterval("7d")).toBe("day");
    expect(getDefaultInterval("30d")).toBe("day");
  });

  test("aggregates a snapshot without leaking fake values", () => {
    const snapshot = aggregateSnapshot([
      {
        totalTokens: 42,
        cost: 350,
        status: "success",
        latencyMs: 120,
        ttftMs: 40,
      },
      {
        totalTokens: 18,
        cost: 150,
        status: "error",
        latencyMs: 300,
        ttftMs: null,
      },
    ] as never);

    expect(snapshot.requests).toBe(2);
    expect(snapshot.tokens).toBe(60);
    expect(snapshot.cost).toBe(500);
    expect(snapshot.successRate).toBe(50);
    expect(snapshot.avgLatency).toBe(210);
    expect(snapshot.avgTtft).toBe(40);
  });
});
