import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
    AlertCircle,
    BarChart3,
    Clock3,
    Coins,
    Loader2,
    RefreshCw,
    ShieldAlert,
    Sparkles,
    TimerReset,
    X,
} from "lucide-react";

type Range = "24h" | "7d" | "30d";
type BreakdownBy = "model" | "provider" | "api_key";
type FailureMixWindow = "today" | "week";

type MetricDelta = {
    value: number;
    previous: number;
    delta: number;
    deltaPercent: number | null;
};

type MetricSnapshot = {
    requests: number;
    tokens: number;
    cost: number;
    successRate: number;
    avgLatency: number;
    avgTtft: number | null;
};

type SummaryResponse = {
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

type TimeseriesPoint = {
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
    errorType: string | null;
    createdAt: string;
    status: "success" | "error" | "rate_limited";
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

type AnalyticsPayload = {
    summary: SummaryResponse;
    timeseries: { points: TimeseriesPoint[] };
    breakdown: { items: BreakdownRow[] };
    errors: {
        series: ErrorSeriesPoint[];
        recentErrors: RecentErrorRow[];
        page: number;
        pageSize: number;
        total: number;
    };
    latency: {
        byModel: LatencyRow[];
        byProvider: LatencyRow[];
    };
};

const rangeOptions: { label: string; value: Range }[] = [
    { label: "24h", value: "24h" },
    { label: "7d", value: "7d" },
    { label: "30d", value: "30d" },
];

const breakdownOptions: { label: string; value: BreakdownBy }[] = [
    { label: "Model", value: "model" },
    { label: "Provider", value: "provider" },
    { label: "API Key", value: "api_key" },
];

function apiUrl(path: string, params: Record<string, string | number | undefined>) {
    const url = new URL(`http://localhost:3000${path}`);
    for (const [key, value] of Object.entries(params)) {
        if (value === undefined) continue;
        url.searchParams.set(key, String(value));
    }
    return url.toString();
}

async function fetchJson<T>(path: string, params: Record<string, string | number | undefined> = {}) {
    const response = await fetch(apiUrl(path, params), {
        credentials: "include",
    });

    if (!response.ok) {
        const raw = await response.text();
        throw new Error(raw || `Request failed with status ${response.status}`);
    }

    return response.json() as Promise<T>;
}

function formatNumber(value: number) {
    return new Intl.NumberFormat(undefined).format(value);
}

function formatPercent(value: number) {
    return `${value.toFixed(1)}%`;
}

function formatLatency(value: number | null) {
    if (value == null) return "—";
    return `${Math.round(value)} ms`;
}

function formatCost(microdollars: number) {
    const dollars = microdollars / 1_000_000;
    const absDollars = Math.abs(dollars);
    const fractionDigits = absDollars >= 1 ? 2 : absDollars >= 0.01 ? 4 : 4;

    return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
    }).format(dollars);
}

function localDateKey(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function formatDelta(delta: MetricDelta, formatter: (value: number) => string) {
    if (delta.deltaPercent == null) {
        return "No prior data";
    }

    const positive = delta.delta >= 0;
    return `${positive ? "+" : "−"}${formatter(Math.abs(delta.delta))} (${positive ? "+" : "−"}${Math.abs(delta.deltaPercent).toFixed(1)}%)`;
}

function metricTone(delta: MetricDelta) {
    if (delta.delta === 0) return "text-muted-foreground";
    return delta.delta > 0 ? "text-emerald-400" : "text-rose-400";
}

function useAnalyticsData(range: Range, breakdownBy: BreakdownBy, page: number) {
    const interval = range === "24h" ? "hour" : "day";

    return useQuery({
        queryKey: ["analytics", range, breakdownBy, page],
        queryFn: async () => {
            const [summary, timeseries, breakdown, errors, latency] = await Promise.all([
                fetchJson<SummaryResponse>("/api/v1/analytics/summary", { range }),
                fetchJson<{ points: TimeseriesPoint[] }>("/api/v1/analytics/timeseries", { range, interval }),
                fetchJson<{ items: BreakdownRow[] }>("/api/v1/analytics/breakdown", { range, by: breakdownBy }),
                fetchJson<AnalyticsPayload["errors"]>("/api/v1/analytics/errors", { range, page, pageSize: 8 }),
                fetchJson<AnalyticsPayload["latency"]>("/api/v1/analytics/latency", { range }),
            ]);

            return { summary, timeseries, breakdown, errors, latency } satisfies AnalyticsPayload;
        },
    });
}

function useFailureMixData(window: FailureMixWindow) {
    const range: Range = window === "today" ? "24h" : "7d";

    return useQuery({
        queryKey: ["analytics-failure-mix", window],
        queryFn: async () => {
            const response = await fetchJson<AnalyticsPayload["errors"]>("/api/v1/analytics/errors", {
                range,
                page: 1,
                pageSize: 100,
            });

            return response;
        },
    });
}

function SummaryCard({
    label,
    value,
    change,
    icon,
    formatter,
    invertTrend = false,
}: {
    label: string;
    value: number | string;
    change: MetricDelta;
    icon: ReactNode;
    formatter?: (value: number) => string;
    invertTrend?: boolean;
}) {
    const displayChange = formatter ? formatDelta(change, formatter) : change.deltaPercent == null ? "No prior data" : `${change.delta >= 0 ? "+" : "−"}${Math.abs(change.deltaPercent).toFixed(1)}%`;
    const tone = change.delta === 0
        ? "text-muted-foreground"
        : invertTrend
            ? (change.delta < 0 ? "text-emerald-400" : "text-rose-400")
            : metricTone(change);

    return (
        <Card className="bg-card/40 border-border/50 min-h-[150px]">
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-3">
                    <CardDescription>{label}</CardDescription>
                    {icon}
                </div>
            </CardHeader>
            <CardContent>
                <div className="text-xl font-semibold tracking-tight sm:text-2xl break-words leading-tight">
                    {value}
                </div>
                <div className={cn("mt-2 text-xs font-medium", tone)}>{displayChange}</div>
            </CardContent>
        </Card>
    );
}

function Chart({
    points,
}: {
    points: TimeseriesPoint[];
}) {
    const width = 900;
    const height = 260;
    const padding = 30;

    const chartData = useMemo(() => {
        const maxValue = Math.max(
            1,
            ...points.flatMap((point) => [point.requests, point.errors])
        );

        const xStep = points.length > 1 ? (width - padding * 2) / (points.length - 1) : 0;
        const yScale = (value: number) => height - padding - ((height - padding * 2) * value) / maxValue;

        const buildPath = (selector: (point: TimeseriesPoint) => number) =>
            points
                .map((point, index) => {
                    const x = padding + index * xStep;
                    const y = yScale(selector(point));
                    return `${index === 0 ? "M" : "L"} ${x} ${y}`;
                })
                .join(" ");

        return {
            maxValue,
            xStep,
            yScale,
            requestsPath: buildPath((point) => point.requests),
            errorsPath: buildPath((point) => point.errors),
        };
    }, [points]);

    if (points.length === 0) {
        return (
            <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">
                No activity yet.
            </div>
        );
    }

    const tickIndices = [0, Math.floor((points.length - 1) / 2), points.length - 1];
    const uniqueTickIndices = Array.from(new Set(tickIndices));

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                    <span className="size-2 rounded-full bg-emerald-400" />
                    Requests
                </div>
                <div className="flex items-center gap-2">
                    <span className="size-2 rounded-full bg-amber-400" />
                    Errors
                </div>
            </div>
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-[260px] overflow-visible">
                {[0, 0.25, 0.5, 0.75, 1].map((step) => {
                    const y = 30 + (height - 60) * step;
                    return (
                        <g key={step}>
                            <line x1={30} y1={y} x2={width - 30} y2={y} stroke="currentColor" strokeOpacity={0.08} />
                        </g>
                    );
                })}

                <path d={chartData.requestsPath} fill="none" stroke="#34d399" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                <path d={chartData.errorsPath} fill="none" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

                {uniqueTickIndices.map((index) => {
                    const point = points[index];
                    if (!point) return null;
                    const x = 30 + index * chartData.xStep;
                    return (
                        <g key={point.timestamp}>
                            <line x1={x} y1={height - 30} x2={x} y2={height - 22} stroke="currentColor" strokeOpacity={0.2} />
                            <text x={x} y={height - 8} textAnchor="middle" className="fill-muted-foreground text-[11px]">
                                {new Intl.DateTimeFormat(undefined, {
                                    month: "short",
                                    day: "numeric",
                                    hour: "numeric",
                                    minute: "2-digit",
                                }).format(new Date(point.timestamp))}
                            </text>
                        </g>
                    );
                })}
            </svg>
        </div>
    );
}

function ErrorDetailsModal({
    row,
    onClose,
}: {
    row: RecentErrorRow;
    onClose: () => void;
}) {
    return (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-2xl rounded-2xl border border-border/60 bg-background shadow-2xl">
                <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
                    <div>
                        <div className="text-xs uppercase tracking-[0.28em] text-muted-foreground">Recent error</div>
                        <h3 className="mt-1 text-lg font-semibold">{row.model}</h3>
                    </div>
                    <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close error details">
                        <X className="size-4" />
                    </Button>
                </div>

                <div className="grid gap-4 px-5 py-5 sm:grid-cols-2">
                    <Detail label="Provider" value={row.provider ?? "Unknown"} />
                    <Detail label="Status" value={row.status} />
                    <Detail label="Error type" value={row.errorType ?? "other"} />
                    <Detail label="Created" value={new Intl.DateTimeFormat(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                    }).format(new Date(row.createdAt))} />
                    <Detail label="Latency" value={formatLatency(row.latencyMs)} />
                    <Detail label="TTFT" value={formatLatency(row.ttftMs)} />
                    <Detail label="Fallbacks" value={`${row.fallbackCount}`} />
                    <Detail label="Streaming" value={row.streaming ? "Yes" : "No"} />
                </div>
            </div>
        </div>
    );
}

function Detail({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-xl border border-border/50 bg-card/20 p-4">
            <div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">{label}</div>
            <div className="mt-2 text-sm font-medium">{value}</div>
        </div>
    );
}

function buildFailureMixRows(series: ErrorSeriesPoint[], window: FailureMixWindow) {
    const todayKey = localDateKey(new Date());
    const rows = new Map<
        string,
        ErrorSeriesPoint & {
            label: string;
            sortAt: number;
        }
    >();

    for (const point of series) {
        const date = new Date(point.timestamp);
        const key = localDateKey(date);

        if (window === "today" && key !== todayKey) {
            continue;
        }

        const current = rows.get(key);
        if (current) {
            current.timeout += point.timeout;
            current.provider_5xx += point.provider_5xx;
            current.invalid_request += point.invalid_request;
            current.rate_limit += point.rate_limit;
            current.other += point.other;
            current.sortAt = Math.min(current.sortAt, date.getTime());
            continue;
        }

        rows.set(key, {
            ...point,
            label:
                window === "today"
                    ? "Today"
                    : new Intl.DateTimeFormat(undefined, {
                          month: "short",
                          day: "numeric",
                      }).format(date),
            sortAt: date.getTime(),
        });
    }

    return Array.from(rows.values()).sort((left, right) => left.sortAt - right.sortAt);
}

export function Analytics() {
    const [range, setRange] = useState<Range>("24h");
    const [breakdownBy, setBreakdownBy] = useState<BreakdownBy>("model");
    const [failureMixWindow, setFailureMixWindow] = useState<FailureMixWindow>("today");
    const [page, setPage] = useState(1);
    const [selectedError, setSelectedError] = useState<RecentErrorRow | null>(null);

    const analyticsQuery = useAnalyticsData(range, breakdownBy, page);
    const failureMixQuery = useFailureMixData(failureMixWindow);

    useEffect(() => {
        setPage(1);
        setSelectedError(null);
    }, [range, breakdownBy]);

    useEffect(() => {
        if (!selectedError) return;
        const exists = analyticsQuery.data?.errors.recentErrors.some((row) => row.id === selectedError.id);
        if (!exists) {
            setSelectedError(null);
        }
    }, [analyticsQuery.data?.errors.recentErrors, selectedError]);

    const summary = analyticsQuery.data?.summary;
    const points = analyticsQuery.data?.timeseries.points ?? [];
    const breakdown = analyticsQuery.data?.breakdown.items ?? [];
    const errors = analyticsQuery.data?.errors;
    const latency = analyticsQuery.data?.latency;
    const failureMixRows = useMemo(
        () => buildFailureMixRows(failureMixQuery.data?.series ?? [], failureMixWindow),
        [failureMixQuery.data?.series, failureMixWindow]
    );

    const totalErrorCount = useMemo(() => {
        return failureMixRows.reduce(
            (sum, point) => sum + point.timeout + point.provider_5xx + point.invalid_request + point.rate_limit + point.other,
            0
        );
    }, [failureMixRows]);

    return (
        <DashboardLayout>
            <div className="space-y-8">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <BarChart3 className="size-4" />
                            Analytics
                        </div>
                        <h1 className="mt-2 text-2xl font-semibold tracking-tight">API gateway observability</h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Requests, latency, failures, and estimated spend across your gateway traffic.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-card/30 p-2 shadow-sm">
                        <Select value={range} onValueChange={(value) => setRange(value as Range)}>
                            <SelectTrigger className="w-[110px] border-border/60 bg-card text-foreground">
                                <SelectValue placeholder="Range" />
                            </SelectTrigger>
                            <SelectContent>
                                {rangeOptions.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                        {option.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <Select value={breakdownBy} onValueChange={(value) => setBreakdownBy(value as BreakdownBy)}>
                            <SelectTrigger className="w-[140px] border-border/60 bg-card text-foreground">
                                <SelectValue placeholder="Breakdown" />
                            </SelectTrigger>
                            <SelectContent>
                                {breakdownOptions.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                        {option.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <Button
                            variant="outline"
                            size="icon"
                            className="border-border/60 bg-card text-foreground hover:bg-accent/60"
                            onClick={() => {
                                analyticsQuery.refetch();
                                failureMixQuery.refetch();
                            }}
                            aria-label="Refresh analytics"
                        >
                            <RefreshCw className={cn("size-4", analyticsQuery.isFetching && "animate-spin")} />
                        </Button>
                    </div>
                </div>

                {analyticsQuery.isLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-10">
                        <Loader2 className="size-4 animate-spin" />
                        Loading analytics...
                    </div>
                ) : analyticsQuery.isError || !summary || !errors || !latency ? (
                    <Card className="border-destructive/30 bg-card/30">
                        <CardContent className="pt-6">
                            <div className="flex items-center justify-between gap-4">
                                <div className="flex items-start gap-2 text-sm text-destructive">
                                    <AlertCircle className="size-4 mt-0.5 shrink-0" />
                                    <span>Failed to load analytics data.</span>
                                </div>
                                <Button variant="outline" size="sm" onClick={() => analyticsQuery.refetch()}>
                                    Retry
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                ) : (
                    <>
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
                            <SummaryCard
                                label="Requests"
                                value={formatNumber(summary.current.requests)}
                                change={summary.changes.requests}
                                icon={<Sparkles className="size-4 text-muted-foreground" />}
                                formatter={formatNumber}
                            />
                            <SummaryCard
                                label="Success rate"
                                value={formatPercent(summary.current.successRate)}
                                change={summary.changes.successRate}
                                icon={<ShieldAlert className="size-4 text-muted-foreground" />}
                                formatter={formatPercent}
                            />
                            <SummaryCard
                                label="Tokens"
                                value={formatNumber(summary.current.tokens)}
                                change={summary.changes.tokens}
                                icon={<TimerReset className="size-4 text-muted-foreground" />}
                                formatter={formatNumber}
                            />
                            <SummaryCard
                                label="Estimated cost"
                                value={formatCost(summary.current.cost)}
                                change={summary.changes.cost}
                                icon={<Coins className="size-4 text-muted-foreground" />}
                                formatter={(value) => formatCost(value)}
                                invertTrend
                            />
                            <SummaryCard
                                label="Avg latency"
                                value={formatLatency(summary.current.avgLatency)}
                                change={summary.changes.avgLatency}
                                icon={<Clock3 className="size-4 text-muted-foreground" />}
                                formatter={formatLatency}
                                invertTrend
                            />
                            <SummaryCard
                                label="Avg TTFT"
                                value={formatLatency(summary.current.avgTtft)}
                                change={summary.changes.avgTtft}
                                icon={<Sparkles className="size-4 text-muted-foreground" />}
                                formatter={formatLatency}
                                invertTrend
                            />
                        </div>

                        <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
                            <Card className="bg-card/30 border-border/50">
                                <CardHeader className="border-b border-border/50">
                                    <CardTitle className="text-base">Request trends</CardTitle>
                                    <CardDescription>Requests and failures across the selected window.</CardDescription>
                                </CardHeader>
                                <CardContent className="pt-6">
                                    <Chart points={points} />
                                </CardContent>
                            </Card>

                            <Card className="bg-card/30 border-border/50">
                                <CardHeader className="border-b border-border/50">
                                    <div className="flex items-start justify-between gap-4">
                                        <div>
                                            <CardTitle className="text-base">Failure mix</CardTitle>
                                            <CardDescription>{formatNumber(totalErrorCount)} total errors in this view.</CardDescription>
                                        </div>
                                        <div className="inline-flex rounded-lg border border-border/60 bg-background/60 p-1">
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant={failureMixWindow === "today" ? "default" : "ghost"}
                                                className="h-7 px-3"
                                                onClick={() => setFailureMixWindow("today")}
                                            >
                                                Today
                                            </Button>
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant={failureMixWindow === "week" ? "default" : "ghost"}
                                                className="h-7 px-3"
                                                onClick={() => setFailureMixWindow("week")}
                                            >
                                                7d
                                            </Button>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="pt-6 space-y-4">
                                    {failureMixQuery.isLoading ? (
                                        <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
                                            <Loader2 className="size-4 animate-spin" />
                                            Loading failure mix...
                                        </div>
                                    ) : failureMixRows.length === 0 ? (
                                        <div className="rounded-xl border border-dashed border-border/60 px-4 py-10 text-center text-sm text-muted-foreground">
                                            No failures yet.
                                        </div>
                                    ) : (
                                        failureMixRows.map((point) => {
                                            const total = point.timeout + point.provider_5xx + point.invalid_request + point.rate_limit + point.other;
                                            return (
                                                <div key={point.timestamp} className="space-y-2">
                                                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                                                        <span>{point.label}</span>
                                                        <span>{total} failures</span>
                                                    </div>
                                                    <div className="flex h-2 overflow-hidden rounded-full bg-muted/30">
                                                        {[
                                                            { key: "timeout", value: point.timeout, color: "bg-amber-400" },
                                                            { key: "provider_5xx", value: point.provider_5xx, color: "bg-rose-400" },
                                                            { key: "invalid_request", value: point.invalid_request, color: "bg-sky-400" },
                                                            { key: "rate_limit", value: point.rate_limit, color: "bg-fuchsia-400" },
                                                            { key: "other", value: point.other, color: "bg-zinc-400" },
                                                        ].map((segment) => (
                                                            <div
                                                                key={`${point.timestamp}-${segment.key}`}
                                                                className={segment.color}
                                                                style={{
                                                                    width: `${total === 0 ? 0 : (segment.value / total) * 100}%`,
                                                                }}
                                                            />
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </CardContent>
                            </Card>
                        </div>

                        <div className="grid gap-4 xl:grid-cols-2">
                            <Card className="bg-card/30 border-border/50">
                                <CardHeader className="border-b border-border/50">
                                    <CardTitle className="text-base">Top breakdown</CardTitle>
                                    <CardDescription>Grouped by {breakdownBy.replace("_", " ")}.</CardDescription>
                                </CardHeader>
                                <CardContent className="p-0">
                                    {breakdown.length === 0 ? (
                                        <div className="px-6 py-10 text-sm text-muted-foreground">No grouped traffic yet.</div>
                                    ) : (
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-sm">
                                                <thead className="border-b border-border/50 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                                                    <tr>
                                                        <th className="px-6 py-3 text-left">Name</th>
                                                        <th className="px-6 py-3 text-right">Requests</th>
                                                        <th className="px-6 py-3 text-right">Success</th>
                                                        <th className="px-6 py-3 text-right">Latency</th>
                                                        <th className="px-6 py-3 text-right">Cost</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {breakdown.map((row) => (
                                                        <tr key={row.id} className="border-b border-border/30 last:border-0">
                                                            <td className="px-6 py-3">
                                                                <div className="font-medium">{row.label}</div>
                                                                <div className="text-xs text-muted-foreground">{row.id}</div>
                                                            </td>
                                                            <td className="px-6 py-3 text-right">{formatNumber(row.requests)}</td>
                                                            <td className="px-6 py-3 text-right">{formatPercent(row.successRate)}</td>
                                                            <td className="px-6 py-3 text-right">{formatLatency(row.avgLatency)}</td>
                                                            <td className="px-6 py-3 text-right">{formatCost(row.cost)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>

                            <Card className="bg-card/30 border-border/50">
                                <CardHeader className="border-b border-border/50">
                                    <CardTitle className="text-base">Latency leaderboard</CardTitle>
                                    <CardDescription>Model and provider response times, plus TTFT.</CardDescription>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <div className="border-b border-border/50">
                                        <div className="px-6 py-3 text-xs uppercase tracking-[0.18em] text-muted-foreground">By model</div>
                                        {latency.byModel.length === 0 ? (
                                            <div className="px-6 pb-6 text-sm text-muted-foreground">No latency samples yet.</div>
                                        ) : (
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-sm">
                                                    <thead className="border-b border-border/50 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                                                        <tr>
                                                            <th className="px-6 py-3 text-left">Model</th>
                                                            <th className="px-6 py-3 text-right">Count</th>
                                                            <th className="px-6 py-3 text-right">p95</th>
                                                            <th className="px-6 py-3 text-right">TTFT p95</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {latency.byModel.slice(0, 5).map((row) => (
                                                            <tr key={row.label} className="border-b border-border/30 last:border-0">
                                                                <td className="px-6 py-3">{row.label}</td>
                                                                <td className="px-6 py-3 text-right">{row.count}</td>
                                                                <td className="px-6 py-3 text-right">{formatLatency(row.p95)}</td>
                                                                <td className="px-6 py-3 text-right">{formatLatency(row.ttftP95)}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>

                                    <div className="px-6 py-3 text-xs uppercase tracking-[0.18em] text-muted-foreground">By provider</div>
                                    {latency.byProvider.length === 0 ? (
                                        <div className="px-6 pb-6 text-sm text-muted-foreground">No latency samples yet.</div>
                                    ) : (
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-sm">
                                                <thead className="border-b border-border/50 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                                                    <tr>
                                                        <th className="px-6 py-3 text-left">Provider</th>
                                                        <th className="px-6 py-3 text-right">Count</th>
                                                        <th className="px-6 py-3 text-right">p95</th>
                                                        <th className="px-6 py-3 text-right">TTFT p95</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {latency.byProvider.slice(0, 5).map((row) => (
                                                        <tr key={row.label} className="border-b border-border/30 last:border-0">
                                                            <td className="px-6 py-3">{row.label}</td>
                                                            <td className="px-6 py-3 text-right">{row.count}</td>
                                                            <td className="px-6 py-3 text-right">{formatLatency(row.p95)}</td>
                                                            <td className="px-6 py-3 text-right">{formatLatency(row.ttftP95)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </div>

                        <Card className="bg-card/30 border-border/50">
                            <CardHeader className="flex-row items-end justify-between gap-4 border-b border-border/50">
                                <div>
                                    <CardTitle className="text-base">Recent errors</CardTitle>
                                    <CardDescription>Click any row to inspect fallback behavior and timings.</CardDescription>
                                </div>
                                <div className="text-xs text-muted-foreground">
                                    Showing {errors.recentErrors.length} of {errors.total}
                                </div>
                            </CardHeader>
                            <CardContent className="p-0">
                                {errors.recentErrors.length === 0 ? (
                                    <div className="px-6 py-10 text-sm text-muted-foreground">No recent errors.</div>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead className="border-b border-border/50 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                                                <tr>
                                                    <th className="px-6 py-3 text-left">Model</th>
                                                    <th className="px-6 py-3 text-left">Provider</th>
                                                    <th className="px-6 py-3 text-left">Type</th>
                                                    <th className="px-6 py-3 text-right">Latency</th>
                                                    <th className="px-6 py-3 text-right">Fallbacks</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {errors.recentErrors.map((row) => (
                                                    <tr
                                                        key={row.id}
                                                        className="border-b border-border/30 last:border-0 hover:bg-accent/30 cursor-pointer"
                                                        onClick={() => setSelectedError(row)}
                                                    >
                                                        <td className="px-6 py-3 font-medium">{row.model}</td>
                                                        <td className="px-6 py-3 text-muted-foreground">{row.provider ?? "Unknown"}</td>
                                                        <td className="px-6 py-3 text-muted-foreground">{row.errorType ?? "other"}</td>
                                                        <td className="px-6 py-3 text-right">{formatLatency(row.latencyMs)}</td>
                                                        <td className="px-6 py-3 text-right">{row.fallbackCount}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}

                                <div className="flex items-center justify-between px-6 py-4 border-t border-border/50">
                                    <div className="text-xs text-muted-foreground">
                                        Page {errors.page} of {Math.max(1, Math.ceil(errors.total / errors.pageSize))}
                                    </div>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={errors.total <= errors.page * errors.pageSize}
                                        onClick={() => setPage((current) => current + 1)}
                                    >
                                        Load older errors
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </>
                )}
            </div>

            {selectedError ? (
                <ErrorDetailsModal row={selectedError} onClose={() => setSelectedError(null)} />
            ) : null}
        </DashboardLayout>
    );
}
