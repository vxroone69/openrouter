import { useQuery } from "@tanstack/react-query";
import { useElysiaClient } from "@/providers/Eden";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router";
import {
    Key,
    Coins,
    ArrowRight,
    Loader2,
    AlertCircle,
    MessageSquareText,
    BarChart3,
    BookOpen,
} from "lucide-react";

export function Dashboard() {
    const elysiaClient = useElysiaClient();

    const apiKeysQuery = useQuery({
        queryKey: ["api-keys"],
        queryFn: async () => {
            const response = await elysiaClient["api-keys"].get();
            if (response.error) throw new Error("Failed to fetch API keys");
            return response.data;
        },
    });

    const apiKeys = apiKeysQuery.data?.apiKeys ?? [];
    const activeKeys = apiKeys.filter((k) => !k.disabled);
    const totalCreditsUsed = apiKeys.reduce(
        (sum, k) => sum + (k.creditsConsumed ?? 0),
        0
    );
    const isLoading = apiKeysQuery.isLoading;
    const hasError = apiKeysQuery.isError;
    const formatLastUsed = (value: Date | string | null | undefined) => {
        if (!value) return "Never";
        const date = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(date.getTime())) return "Never";
        return new Intl.DateTimeFormat(undefined, {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
        }).format(date);
    };

    return (
        <DashboardLayout>
            <div className="space-y-8">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
                        <p className="text-muted-foreground text-sm mt-1">
                            Account health, key activity, and gateway readiness.
                        </p>
                    </div>
                    <Button variant="outline" size="sm" asChild>
                        <Link to="/docs">
                            Read docs
                            <ArrowRight className="size-3.5" />
                        </Link>
                    </Button>
                </div>

                {/* Stats */}
                {hasError ? (
                    <Card className="bg-card/20 border-destructive/30">
                        <CardContent className="pt-6">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div className="flex items-start gap-2.5 text-sm text-destructive">
                                    <AlertCircle className="size-4 shrink-0 mt-0.5" />
                                    <span>Failed to load dashboard data.</span>
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                        apiKeysQuery.refetch();
                                    }}
                                >
                                    Retry
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                ) : isLoading ? (
                    <div className="flex items-center gap-2 text-muted-foreground text-sm py-8">
                        <Loader2 className="size-4 animate-spin" />
                        Loading...
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <Card className="bg-card/50 border-border/50">
                            <CardHeader className="pb-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-muted-foreground">Active API Keys</span>
                                    <Key className="size-4 text-muted-foreground/60" />
                                </div>
                            </CardHeader>
                            <CardContent>
                                <p className="text-3xl font-bold tracking-tight">
                                    {activeKeys.length}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                    {apiKeys.length} total
                                </p>
                            </CardContent>
                        </Card>

                        <Card className="bg-card/50 border-border/50">
                            <CardHeader className="pb-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-muted-foreground">Credits Used</span>
                                    <Coins className="size-4 text-muted-foreground/60" />
                                </div>
                            </CardHeader>
                            <CardContent>
                                <p className="text-3xl font-bold tracking-tight">
                                    {totalCreditsUsed.toLocaleString()}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                    across all keys
                                </p>
                            </CardContent>
                        </Card>

                        <Card className="bg-card/50 border-border/50">
                            <CardHeader className="pb-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-muted-foreground">Gateway Docs</span>
                                    <BookOpen className="size-4 text-muted-foreground/60" />
                                </div>
                            </CardHeader>
                            <CardContent>
                                <p className="text-3xl font-bold tracking-tight">Ready</p>
                                <p className="text-xs text-muted-foreground mt-1">
                                    examples, memory, billing
                                </p>
                            </CardContent>
                        </Card>
                    </div>
                )}

                {/* Quick actions */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Card className="bg-card/30 border-border/40 hover:border-border/70 transition-colors">
                        <CardContent className="pt-6">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <div className="size-10 rounded-lg bg-primary/5 border border-border/50 flex items-center justify-center mb-3">
                                        <BookOpen className="size-5 text-muted-foreground" />
                                    </div>
                                    <h3 className="font-semibold text-sm">Developer Docs</h3>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Learn each Synapse feature and wire an app to the gateway.
                                    </p>
                                </div>
                                <Button variant="outline" size="sm" asChild>
                                    <Link to="/docs">
                                        Open
                                        <ArrowRight className="size-3.5" />
                                    </Link>
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-card/30 border-border/40 hover:border-border/70 transition-colors">
                        <CardContent className="pt-6">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <div className="size-10 rounded-lg bg-primary/5 border border-border/50 flex items-center justify-center mb-3">
                                        <BarChart3 className="size-5 text-muted-foreground" />
                                    </div>
                                    <h3 className="font-semibold text-sm">Analytics</h3>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Inspect request volume, latency, failures, and cost.
                                    </p>
                                </div>
                                <Button variant="outline" size="sm" asChild>
                                    <Link to="/analytics">
                                        Open
                                        <ArrowRight className="size-3.5" />
                                    </Link>
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-card/30 border-border/40 hover:border-border/70 transition-colors">
                        <CardContent className="pt-6">
                            <div className="flex items-start justify-between">
                                <div>
                                    <div className="size-10 rounded-lg bg-primary/5 border border-border/50 flex items-center justify-center mb-3">
                                        <MessageSquareText className="size-5 text-muted-foreground" />
                                    </div>
                                    <h3 className="font-semibold text-sm">Chat Playground</h3>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Test streaming responses with your own model choice.
                                    </p>
                                </div>
                                <Button variant="outline" size="sm" asChild>
                                    <Link to="/playground">
                                        Open
                                        <ArrowRight className="size-3.5" />
                                    </Link>
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-card/30 border-border/40 hover:border-border/70 transition-colors">
                        <CardContent className="pt-6">
                            <div className="flex items-start justify-between">
                                <div>
                                    <div className="size-10 rounded-lg bg-primary/5 border border-border/50 flex items-center justify-center mb-3">
                                        <Coins className="size-5 text-muted-foreground" />
                                    </div>
                                    <h3 className="font-semibold text-sm">Add Credits</h3>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Top up your balance to keep making requests.
                                    </p>
                                </div>
                                <Button variant="outline" size="sm" asChild>
                                    <Link to="/credits">
                                        Go
                                        <ArrowRight className="size-3.5" />
                                    </Link>
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Recent API keys */}
                {apiKeys.length > 0 && (
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-sm font-semibold">Your API Keys</h2>
                            <Button variant="ghost" size="sm" asChild>
                                <Link to="/api-keys" className="text-xs">
                                    View all
                                    <ArrowRight className="size-3" />
                                </Link>
                            </Button>
                        </div>
                        <div className="rounded-lg border border-border/50 bg-card/30 overflow-hidden">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-border/50">
                                        <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Name</th>
                                        <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Key</th>
                                        <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Status</th>
                                        <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Last Used</th>
                                        <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Credits Used</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {apiKeys.slice(0, 5).map((key) => (
                                        <tr key={key.id} className="border-b border-border/30 last:border-0">
                                            <td className="px-4 py-3 font-medium">{key.name}</td>
                                            <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                                                {key.apiKey.slice(0, 12)}...{key.apiKey.slice(-4)}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span
                                                    className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                                                        key.disabled
                                                            ? "text-muted-foreground"
                                                            : "text-emerald-400"
                                                    }`}
                                                >
                                                    <span
                                                        className={`size-1.5 rounded-full ${
                                                            key.disabled ? "bg-muted-foreground" : "bg-emerald-400"
                                                        }`}
                                                    />
                                                    {key.disabled ? "Disabled" : "Active"}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-muted-foreground">
                                                {formatLastUsed(key.lastUsed)}
                                            </td>
                                            <td className="px-4 py-3 text-right tabular-nums">
                                                {(key.creditsConsumed ?? 0).toLocaleString()}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </DashboardLayout>
    );
}
