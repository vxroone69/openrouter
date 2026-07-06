import { prisma } from "db";

export type AnalyticsRange = "24h" | "7d" | "30d";
export type AnalyticsInterval = "hour" | "day";
export type AnalyticsBreakdownBy = "model" | "provider" | "api_key";
export type RequestLogStatus = "success" | "error" | "rate_limited";
export type RequestLogErrorType = "timeout" | "provider_5xx" | "invalid_request" | "rate_limit" | "other";

type RequestLogRow = {
  id: number;
  model: string;
  provider: string | null;
  status: RequestLogStatus;
  errorType: RequestLogErrorType | null;
  fallbackUsed: boolean;
  fallbackCount: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
  streaming: boolean;
  latencyMs: number;
  ttftMs: number | null;
  createdAt: Date;
  apiKey: {
    id: number;
    name: string;
  };
};

type MetricSnapshot = {
  requests: number;
  tokens: number;
  cost: number;
  successRate: number;
  avgLatency: number;
  avgTtft: number | null;
};

type MetricDelta = {
  value: number;
  previous: number;
  delta: number;
  deltaPercent: number | null;
};

type SummaryPair = {
  current: MetricSnapshot;
  previous: MetricSnapshot;
  changes: {
    requests: MetricDelta;
    tokens: MetricDelta;
    cost: MetricDelta;
    successRate: MetricDelta;
    avgLatency: MetricDelta;
    avgTtft: MetricDelta;
  };
};

type BucketPoint = {
  timestamp: string;
  requests: number;
  tokens: number;
  cost: number;
  errors: number;
};

type BreakdownRow = {
  id: string;
  label: string;
  requests: number;
  tokens: number;
  cost: number;
  successRate: number;
  avgLatency: number;
  avgTtft: number | null;
};

type ErrorSeriesPoint = {
  timestamp: string;
  timeout: number;
  provider_5xx: number;
  invalid_request: number;
  rate_limit: number;
  other: number;
};

type RecentErrorRow = {
  id: string;
  model: string;
  provider: string | null;
  errorType: RequestLogErrorType | null;
  createdAt: string;
  status: RequestLogStatus;
  fallbackCount: number;
  fallbackUsed: boolean;
  latencyMs: number;
  streaming: boolean;
  ttftMs: number | null;
};

type LatencyRow = {
  label: string;
  count: number;
  p50: number | null;
  p95: number | null;
  p99: number | null;
  ttftP50: number | null;
  ttftP95: number | null;
  ttftP99: number | null;
};

function durationMs(range: AnalyticsRange) {
  if (range === "24h") return 24 * 60 * 60 * 1000;
  if (range === "7d") return 7 * 24 * 60 * 60 * 1000;
  return 30 * 24 * 60 * 60 * 1000;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function percent(value: number, total: number) {
  if (total === 0) return 0;
  return round((value / total) * 100);
}

function change(current: number, previous: number): MetricDelta {
  return {
    value: current,
    previous,
    delta: round(current - previous),
    deltaPercent: previous === 0 ? null : round(((current - previous) / previous) * 100),
  };
}

function percentile(values: number[], percentileValue: number) {
  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];

  const index = (sorted.length - 1) * percentileValue;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) {
    return sorted[lower];
  }

  return round(sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (index - lower));
}

function truncateToBucket(date: Date, interval: AnalyticsInterval) {
  const next = new Date(date);
  next.setMilliseconds(0);

  if (interval === "day") {
    next.setHours(0, 0, 0, 0);
    return next;
  }

  next.setMinutes(0, 0, 0);
  return next;
}

function advanceBucket(date: Date, interval: AnalyticsInterval) {
  const next = new Date(date);
  if (interval === "day") {
    next.setDate(next.getDate() + 1);
    return next;
  }

  next.setHours(next.getHours() + 1);
  return next;
}

function bucketLabel(date: Date) {
  return date.toISOString();
}

function rangeWindow(range: AnalyticsRange, now = new Date()) {
  const span = durationMs(range);
  const currentEnd = now;
  const currentStart = new Date(now.getTime() - span);
  const previousEnd = currentStart;
  const previousStart = new Date(currentStart.getTime() - span);

  return {
    currentStart,
    currentEnd,
    previousStart,
    previousEnd,
  };
}

export function getDefaultInterval(range: AnalyticsRange): AnalyticsInterval {
  return range === "24h" ? "hour" : "day";
}

export function classifyErrorTypeFromMessage(message: string): RequestLogErrorType {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("timeout") ||
    normalized.includes("timed out") ||
    normalized.includes("deadline exceeded")
  ) {
    return "timeout";
  }

  if (
    normalized.includes("429") ||
    normalized.includes("rate limit") ||
    normalized.includes("quota")
  ) {
    return "rate_limit";
  }

  if (
    normalized.includes("400") ||
    normalized.includes("invalid request") ||
    normalized.includes("bad request") ||
    normalized.includes("unsupported") ||
    normalized.includes("no providers mapped") ||
    normalized.includes("invalid api key") ||
    normalized.includes("insufficient credits") ||
    normalized.includes("no provider found") ||
    normalized.includes("no route for that uri") ||
    normalized.includes("not found")
  ) {
    return "invalid_request";
  }

  if (
    normalized.includes("500") ||
    normalized.includes("502") ||
    normalized.includes("503") ||
    normalized.includes("504") ||
    normalized.includes("internal server error") ||
    normalized.includes("unavailable")
  ) {
    return "provider_5xx";
  }

  return "other";
}

export function aggregateSnapshot(logs: RequestLogRow[]): MetricSnapshot {
  const requests = logs.length;
  const tokens = logs.reduce((sum, log) => sum + log.totalTokens, 0);
  const cost = logs.reduce((sum, log) => sum + log.cost, 0);
  const successCount = logs.filter((log) => log.status === "success").length;
  const avgLatency = average(logs.map((log) => log.latencyMs));
  const ttftValues = logs
    .map((log) => log.ttftMs)
    .filter((value): value is number => typeof value === "number");

  return {
    requests,
    tokens,
    cost,
    successRate: percent(successCount, requests),
    avgLatency,
    avgTtft: ttftValues.length > 0 ? average(ttftValues) : null,
  };
}

function buildBuckets(start: Date, end: Date, interval: AnalyticsInterval) {
  const buckets: Date[] = [];
  let cursor = truncateToBucket(start, interval);
  const stop = truncateToBucket(end, interval);

  while (cursor <= stop) {
    buckets.push(new Date(cursor));
    cursor = advanceBucket(cursor, interval);
  }

  return buckets;
}

function emptyErrorBucket() {
  return {
    timeout: 0,
    provider_5xx: 0,
    invalid_request: 0,
    rate_limit: 0,
    other: 0,
  };
}

function normalizeErrorType(value: RequestLogErrorType | null) {
  return value ?? "other";
}

export abstract class AnalyticsService {
  static async getSummary(userId: number, range: AnalyticsRange): Promise<SummaryPair> {
    const { currentStart, currentEnd, previousStart, previousEnd } = rangeWindow(range);

    const [currentLogs, previousLogs] = await Promise.all([
      prisma.requestLog.findMany({
        where: {
          userId,
          createdAt: {
            gte: currentStart,
            lt: currentEnd,
          },
        },
        select: {
          id: true,
          model: true,
          provider: true,
          status: true,
          errorType: true,
          fallbackUsed: true,
          fallbackCount: true,
          promptTokens: true,
          completionTokens: true,
          totalTokens: true,
          cost: true,
          streaming: true,
          latencyMs: true,
          ttftMs: true,
          createdAt: true,
          apiKey: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }) as Promise<RequestLogRow[]>,
      prisma.requestLog.findMany({
        where: {
          userId,
          createdAt: {
            gte: previousStart,
            lt: previousEnd,
          },
        },
        select: {
          id: true,
          model: true,
          provider: true,
          status: true,
          errorType: true,
          fallbackUsed: true,
          fallbackCount: true,
          promptTokens: true,
          completionTokens: true,
          totalTokens: true,
          cost: true,
          streaming: true,
          latencyMs: true,
          ttftMs: true,
          createdAt: true,
          apiKey: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }) as Promise<RequestLogRow[]>,
    ]);

    const current = aggregateSnapshot(currentLogs);
    const previous = aggregateSnapshot(previousLogs);

    return {
      current,
      previous,
      changes: {
        requests: change(current.requests, previous.requests),
        tokens: change(current.tokens, previous.tokens),
        cost: change(current.cost, previous.cost),
        successRate: change(current.successRate, previous.successRate),
        avgLatency: change(current.avgLatency, previous.avgLatency),
        avgTtft: change(current.avgTtft ?? 0, previous.avgTtft ?? 0),
      },
    };
  }

  static async getTimeseries(
    userId: number,
    range: AnalyticsRange,
    interval: AnalyticsInterval,
  ): Promise<BucketPoint[]> {
    const { currentStart, currentEnd } = rangeWindow(range);
    const logs = await prisma.requestLog.findMany({
      where: {
        userId,
        createdAt: {
          gte: currentStart,
          lt: currentEnd,
        },
      },
      select: {
        totalTokens: true,
        cost: true,
        status: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    const buckets = buildBuckets(currentStart, currentEnd, interval);
    const map = new Map<string, BucketPoint>();

    for (const bucket of buckets) {
      const timestamp = bucketLabel(bucket);
      map.set(timestamp, {
        timestamp,
        requests: 0,
        tokens: 0,
        cost: 0,
        errors: 0,
      });
    }

    for (const log of logs) {
      const bucket = truncateToBucket(log.createdAt, interval);
      const timestamp = bucketLabel(bucket);
      const entry = map.get(timestamp);
      if (!entry) continue;

      entry.requests += 1;
      entry.tokens += log.totalTokens;
      entry.cost += log.cost;
      if (log.status !== "success") {
        entry.errors += 1;
      }
    }

    return Array.from(map.values());
  }

  static async getBreakdown(
    userId: number,
    range: AnalyticsRange,
    by: AnalyticsBreakdownBy,
  ): Promise<BreakdownRow[]> {
    const { currentStart, currentEnd } = rangeWindow(range);
    const logs = await prisma.requestLog.findMany({
      where: {
        userId,
        createdAt: {
          gte: currentStart,
          lt: currentEnd,
        },
      },
      select: {
        model: true,
        provider: true,
        status: true,
        totalTokens: true,
        cost: true,
        latencyMs: true,
        ttftMs: true,
        apiKey: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    const groups = new Map<
      string,
      {
        id: string;
        label: string;
        requests: number;
        tokens: number;
        cost: number;
        successCount: number;
        latencies: number[];
        ttfts: number[];
      }
    >();

    for (const log of logs) {
      const target =
        by === "model"
          ? { id: log.model, label: log.model }
          : by === "provider"
            ? { id: log.provider ?? "unknown", label: log.provider ?? "Unknown provider" }
            : { id: String(log.apiKey.id), label: log.apiKey.name };

      const entry = groups.get(target.id) ?? {
        id: target.id,
        label: target.label,
        requests: 0,
        tokens: 0,
        cost: 0,
        successCount: 0,
        latencies: [],
        ttfts: [],
      };

      entry.requests += 1;
      entry.tokens += log.totalTokens;
      entry.cost += log.cost;
      entry.latencies.push(log.latencyMs);
      if (log.status === "success") {
        entry.successCount += 1;
      }
      if (typeof log.ttftMs === "number") {
        entry.ttfts.push(log.ttftMs);
      }

      groups.set(target.id, entry);
    }

    return Array.from(groups.values())
      .sort((left, right) => right.requests - left.requests || right.cost - left.cost)
      .map((entry) => ({
        id: entry.id,
        label: entry.label,
        requests: entry.requests,
        tokens: entry.tokens,
        cost: entry.cost,
        successRate: percent(entry.successCount, entry.requests),
        avgLatency: average(entry.latencies),
        avgTtft: entry.ttfts.length > 0 ? average(entry.ttfts) : null,
      }));
  }

  static async getErrors(
    userId: number,
    range: AnalyticsRange,
    page: number,
    pageSize: number,
  ): Promise<{
    series: ErrorSeriesPoint[];
    recentErrors: RecentErrorRow[];
    page: number;
    pageSize: number;
    total: number;
  }> {
    const { currentStart, currentEnd } = rangeWindow(range);
    const logs = await prisma.requestLog.findMany({
      where: {
        userId,
        createdAt: {
          gte: currentStart,
          lt: currentEnd,
        },
        status: {
          not: "success",
        },
      },
      select: {
        id: true,
        model: true,
        provider: true,
        status: true,
        errorType: true,
        fallbackUsed: true,
        fallbackCount: true,
        latencyMs: true,
        streaming: true,
        ttftMs: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    const interval: AnalyticsInterval = getDefaultInterval(range);
    const buckets = buildBuckets(currentStart, currentEnd, interval);
    const seriesMap = new Map<string, ErrorSeriesPoint>();

    for (const bucket of buckets) {
      const timestamp = bucketLabel(bucket);
      seriesMap.set(timestamp, {
        timestamp,
        ...emptyErrorBucket(),
      });
    }

    for (const log of logs) {
      const bucket = truncateToBucket(log.createdAt, interval);
      const timestamp = bucketLabel(bucket);
      const entry = seriesMap.get(timestamp);
      if (!entry) continue;
      const errorType = normalizeErrorType(log.errorType);
      entry[errorType] += 1;
    }

    const total = logs.length;
    const recentSlice = [...logs]
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .slice((page - 1) * pageSize, page * pageSize)
      .map((log) => ({
        id: String(log.id),
        model: log.model,
        provider: log.provider,
        errorType: log.errorType,
        createdAt: log.createdAt.toISOString(),
        status: log.status,
        fallbackCount: log.fallbackCount,
        fallbackUsed: log.fallbackUsed,
        latencyMs: log.latencyMs,
        streaming: log.streaming,
        ttftMs: log.ttftMs,
      }));

    return {
      series: Array.from(seriesMap.values()),
      recentErrors: recentSlice,
      page,
      pageSize,
      total,
    };
  }

  static async getLatency(
    userId: number,
    range: AnalyticsRange,
  ): Promise<{
    byModel: LatencyRow[];
    byProvider: LatencyRow[];
  }> {
    const { currentStart, currentEnd } = rangeWindow(range);
    const logs = await prisma.requestLog.findMany({
      where: {
        userId,
        createdAt: {
          gte: currentStart,
          lt: currentEnd,
        },
      },
      select: {
        model: true,
        provider: true,
        latencyMs: true,
        ttftMs: true,
      },
    });

    const buildRows = (keySelector: (log: (typeof logs)[number]) => string | null): LatencyRow[] => {
      const groups = new Map<string, { label: string; latencies: number[]; ttfts: number[] }>();

      for (const log of logs) {
        const key = keySelector(log);
        if (!key) continue;

        const entry = groups.get(key) ?? {
          label: key,
          latencies: [],
          ttfts: [],
        };

        entry.latencies.push(log.latencyMs);
        if (typeof log.ttftMs === "number") {
          entry.ttfts.push(log.ttftMs);
        }
        groups.set(key, entry);
      }

      return Array.from(groups.values())
        .sort((left, right) => right.latencies.length - left.latencies.length)
        .map<LatencyRow>((entry) => ({
          label: entry.label,
          count: entry.latencies.length,
          p50: percentile(entry.latencies, 0.5) ?? null,
          p95: percentile(entry.latencies, 0.95) ?? null,
          p99: percentile(entry.latencies, 0.99) ?? null,
          ttftP50: percentile(entry.ttfts, 0.5) ?? null,
          ttftP95: percentile(entry.ttfts, 0.95) ?? null,
          ttftP99: percentile(entry.ttfts, 0.99) ?? null,
        }));
    };

    return {
      byModel: buildRows((log) => log.model),
      byProvider: buildRows((log) => log.provider),
    };
  }
}

export type {
  BucketPoint,
  BreakdownRow,
  ErrorSeriesPoint,
  LatencyRow,
  MetricSnapshot,
  RecentErrorRow,
  SummaryPair,
};
