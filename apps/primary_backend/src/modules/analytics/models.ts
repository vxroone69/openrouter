import { t } from "elysia";

const metricDeltaSchema = t.Object({
  value: t.Number(),
  previous: t.Number(),
  delta: t.Number(),
  deltaPercent: t.Nullable(t.Number()),
});

const metricSnapshotSchema = t.Object({
  requests: t.Number(),
  tokens: t.Number(),
  cost: t.Number(),
  successRate: t.Number(),
  avgLatency: t.Number(),
  avgTtft: t.Nullable(t.Number()),
});

export namespace AnalyticsModel {
  const requestLogStatusSchema = t.Union([
    t.Literal("success"),
    t.Literal("error"),
    t.Literal("rate_limited"),
  ]);

  export const summaryResponseSchema = t.Object({
    current: metricSnapshotSchema,
    previous: metricSnapshotSchema,
    changes: t.Object({
      requests: metricDeltaSchema,
      tokens: metricDeltaSchema,
      cost: metricDeltaSchema,
      successRate: metricDeltaSchema,
      avgLatency: metricDeltaSchema,
      avgTtft: metricDeltaSchema,
    }),
  });

  export type summaryResponseSchema = typeof summaryResponseSchema.static;

  export const timeseriesResponseSchema = t.Object({
    points: t.Array(t.Object({
      timestamp: t.String(),
      requests: t.Number(),
      tokens: t.Number(),
      cost: t.Number(),
      errors: t.Number(),
    })),
  });

  export type timeseriesResponseSchema = typeof timeseriesResponseSchema.static;

  export const breakdownResponseSchema = t.Object({
    items: t.Array(t.Object({
      id: t.String(),
      label: t.String(),
      requests: t.Number(),
      tokens: t.Number(),
      cost: t.Number(),
      successRate: t.Number(),
      avgLatency: t.Number(),
      avgTtft: t.Nullable(t.Number()),
    })),
  });

  export type breakdownResponseSchema = typeof breakdownResponseSchema.static;

  export const errorsResponseSchema = t.Object({
    series: t.Array(t.Object({
      timestamp: t.String(),
      timeout: t.Number(),
      provider_5xx: t.Number(),
      invalid_request: t.Number(),
      rate_limit: t.Number(),
      other: t.Number(),
    })),
    recentErrors: t.Array(t.Object({
      id: t.String(),
      model: t.String(),
      provider: t.Nullable(t.String()),
      errorType: t.Nullable(t.String()),
      createdAt: t.String(),
      status: requestLogStatusSchema,
      fallbackCount: t.Number(),
      fallbackUsed: t.Boolean(),
      latencyMs: t.Number(),
      streaming: t.Boolean(),
      ttftMs: t.Nullable(t.Number()),
    })),
    page: t.Number(),
    pageSize: t.Number(),
    total: t.Number(),
  });

  export type errorsResponseSchema = typeof errorsResponseSchema.static;

  export const latencyResponseSchema = t.Object({
    byModel: t.Array(t.Object({
      label: t.String(),
      count: t.Number(),
      p50: t.Nullable(t.Number()),
      p95: t.Nullable(t.Number()),
      p99: t.Nullable(t.Number()),
      ttftP50: t.Nullable(t.Number()),
      ttftP95: t.Nullable(t.Number()),
      ttftP99: t.Nullable(t.Number()),
    })),
    byProvider: t.Array(t.Object({
      label: t.String(),
      count: t.Number(),
      p50: t.Nullable(t.Number()),
      p95: t.Nullable(t.Number()),
      p99: t.Nullable(t.Number()),
      ttftP50: t.Nullable(t.Number()),
      ttftP95: t.Nullable(t.Number()),
      ttftP99: t.Nullable(t.Number()),
    })),
  });

  export type latencyResponseSchema = typeof latencyResponseSchema.static;
}
