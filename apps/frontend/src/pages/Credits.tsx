import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useElysiaClient } from "@/providers/Eden";
import { DashboardLayout } from "@/components/DashboardLayout";
import {
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
    Coins,
    Plus,
    Loader2,
    CheckCircle2,
    AlertCircle,
    Wallet,
    TrendingUp,
} from "lucide-react";

export function Credits() {
    const elysiaClient = useElysiaClient();
    const queryClient = useQueryClient();

    const apiKeysQuery = useQuery({
        queryKey: ["api-keys"],
        queryFn: async () => {
            const response = await elysiaClient["api-keys"].get();
            if (response.error) throw new Error("Failed to fetch API keys");
            return response.data;
        },
    });

    const userProfileQuery = useQuery({
        queryKey: ["user-profile"],
        queryFn: async() => {
            const response = await elysiaClient["auth"].profile.get();
            if (response.error) throw new Error("Error while fetching user details")
                return response.data;
        }
    })

    const checkoutMutation = useMutation({
        mutationFn: async (packageId: "starter" | "growth" | "scale") => {
            const response = await elysiaClient.payments.checkout.post({
                kind: "credits",
                packageId,
            });
            if (response.error) {
                const errValue = response.error.value as { message?: string } | undefined;
                throw new Error(errValue?.message || "Failed to start checkout");
            }
            return response.data;
        },
        onSuccess: (data) => {
            window.location.href = data.url;
        },
    });

    const upgradeMutation = useMutation({
        mutationFn: async () => {
            const response = await elysiaClient.payments.checkout.post({
                kind: "pro_upgrade",
            });
            if (response.error) {
                throw new Error("Failed to start upgrade checkout");
            }
            return response.data;
        },
        onSuccess: (data) => {
            window.location.href = data.url;
        },
    });

    const apiKeys = apiKeysQuery.data?.apiKeys ?? [];
    const totalCreditsUsed = apiKeys.reduce(
        (sum, k) => sum + (k.creditsConsumed ?? 0),
        0
    );
    const credits = userProfileQuery.data?.credits;
    const plan = userProfileQuery.data?.plan ?? "free";
    const hasLoadError = apiKeysQuery.isError || userProfileQuery.isError;

    return (
        <DashboardLayout>
            <div className="space-y-8">
                {/* Header */}
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Credits</h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        Manage your account balance and add credits.
                    </p>
                </div>

                {hasLoadError && (
                    <Card className="bg-card/20 border-destructive/30">
                        <CardContent className="pt-6">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div className="flex items-start gap-2.5 text-sm text-destructive">
                                    <AlertCircle className="size-4 shrink-0 mt-0.5" />
                                    <span>Failed to load credit data.</span>
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                        apiKeysQuery.refetch();
                                        userProfileQuery.refetch();
                                    }}
                                >
                                    Retry
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Balance & usage */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {new URLSearchParams(window.location.search).get("checkout") === "success" && (
                        <Card className="sm:col-span-2 bg-card/50 border-emerald-500/20">
                            <CardContent className="pt-6">
                                <div className="flex items-center gap-3">
                                    <div className="size-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
                                        <Wallet className="size-5 text-emerald-400" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-emerald-400">Current Balance</p>
                                        <p className="text-3xl font-bold tracking-tight">
                                            Checkout complete
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    <Card className="bg-card/50 border-border/50">
                        <CardHeader className="pb-2">
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">Credits available</span>
                                <TrendingUp className="size-4 text-muted-foreground/60" />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <p className="text-3xl font-bold tracking-tight">
                                {userProfileQuery.isLoading ? (
                                    <Loader2 className="size-5 animate-spin text-muted-foreground" />
                                ) : userProfileQuery.isError ? (
                                    "—"
                                ) : (
                                    credits
                                )}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                                across {apiKeys.length} API key{apiKeys.length !== 1 ? "s" : ""}
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="bg-card/50 border-border/50">
                        <CardHeader className="pb-2">
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">Per-Key Breakdown</span>
                                <Coins className="size-4 text-muted-foreground/60" />
                            </div>
                        </CardHeader>
                        <CardContent>
                            {apiKeysQuery.isLoading ? (
                                <Loader2 className="size-5 animate-spin text-muted-foreground" />
                            ) : apiKeys.length === 0 ? (
                                <p className="text-sm text-muted-foreground">No API keys yet</p>
                            ) : (
                                <div className="space-y-2">
                                    {apiKeys.slice(0, 4).map((key) => (
                                        <div key={key.id} className="flex items-center justify-between text-sm">
                                            <span className="text-muted-foreground truncate mr-4">{key.name}</span>
                                            <span className="tabular-nums font-medium">
                                                {(key.creditsConsumed ?? 0).toLocaleString()}
                                            </span>
                                        </div>
                                    ))}
                                    {apiKeys.length > 4 && (
                                        <p className="text-xs text-muted-foreground">
                                            +{apiKeys.length - 4} more
                                        </p>
                                    )}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* Add credits */}
                <Card className="bg-card/30 border-border/50">
                    <CardHeader>
                        <CardTitle className="text-lg">Plan</CardTitle>
                        <CardDescription>
                            Pro unlocks paid provider models and higher-cost routing options.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <p className="text-sm text-muted-foreground">Current plan</p>
                            <p className="text-2xl font-bold capitalize">{plan}</p>
                        </div>
                        <Button
                            size="lg"
                            disabled={plan === "pro" || upgradeMutation.isPending}
                            onClick={() => upgradeMutation.mutate()}
                        >
                            {upgradeMutation.isPending ? (
                                <>
                                    <Loader2 className="size-4 animate-spin" />
                                    Upgrading...
                                </>
                            ) : plan === "pro" ? (
                                "Pro active"
                            ) : (
                                "Upgrade to Pro"
                            )}
                        </Button>
                    </CardContent>
                </Card>

                <Card className="bg-card/30 border-border/50">
                    <CardHeader>
                        <CardTitle className="text-lg">Add Credits</CardTitle>
                        <CardDescription>
                            Mock credit packages for testing the commercial flow.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid gap-3 md:grid-cols-3">
                            {[
                                { id: "starter" as const, label: "Starter", credits: 10_000 },
                                { id: "growth" as const, label: "Growth", credits: 50_000 },
                                { id: "scale" as const, label: "Scale", credits: 200_000 },
                            ].map((pack) => (
                            <div key={pack.id} className="flex flex-col gap-3 rounded-lg border border-border/50 bg-card/50 px-4 py-3">
                                <div className="flex items-center gap-3">
                                <Coins className="size-5 text-muted-foreground" />
                                <div>
                                    <p className="text-sm font-medium">{pack.label}</p>
                                    <p className="text-xs text-muted-foreground">{pack.credits.toLocaleString()} credits</p>
                                </div>
                                </div>
                                <Button
                                    variant="outline"
                                    onClick={() => checkoutMutation.mutate(pack.id)}
                                    disabled={checkoutMutation.isPending}
                                >
                                    {checkoutMutation.isPending ? "Opening..." : "Checkout"}
                                </Button>
                            </div>
                            ))}
                        </div>

                        {new URLSearchParams(window.location.search).get("checkout") === "success" && (
                            <div className="flex items-start gap-2.5 text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3.5 py-3 mt-4">
                                <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
                                <span>
                                    Payment completed. Credits will appear after Stripe webhook processing.
                                </span>
                            </div>
                        )}

                        {checkoutMutation.isError && (
                            <div className="flex items-start gap-2.5 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3.5 py-3 mt-4">
                                <AlertCircle className="size-4 shrink-0 mt-0.5" />
                                <span>
                                    {checkoutMutation.error?.message || "Failed to start checkout. Please try again."}
                                </span>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </DashboardLayout>
    );
}
