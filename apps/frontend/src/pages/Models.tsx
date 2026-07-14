import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useElysiaClient } from "@/providers/Eden";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
    ArrowLeft,
    ArrowRight,
    Check,
    Copy,
    Loader2,
    Search,
    Server,
    Sparkles,
    Zap,
} from "lucide-react";

type CatalogModel = {
    id: string;
    name: string;
    slug: string;
    minPlan: "free" | "pro";
    company: {
        id: string;
        name: string;
        website: string;
    };
};

type ModelProvider = {
    id: string;
    providerId: string;
    providerName: string;
    providerWebsite: string;
    inputTokenCostNanoDollars: number;
    outputTokenCostNanoDollars: number;
};

type ModelWithProviders = CatalogModel & {
    providers: ModelProvider[];
};

function formatPerMillionTokens(nanoDollars: number) {
    const dollars = nanoDollars / 1_000;
    return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: dollars >= 1 ? 2 : 3,
        maximumFractionDigits: dollars >= 1 ? 2 : 3,
    }).format(dollars);
}

function priceRange(values: number[]) {
    if (values.length === 0) return "—";
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (min === max) return formatPerMillionTokens(min);
    return `${formatPerMillionTokens(min)}-${formatPerMillionTokens(max)}`;
}

function planTone(plan: CatalogModel["minPlan"]) {
    return plan === "pro"
        ? "border-amber-500/20 bg-amber-500/10 text-amber-300"
        : "border-emerald-500/20 bg-emerald-500/10 text-emerald-300";
}

export function Models() {
    const elysiaClient = useElysiaClient();
    const [search, setSearch] = useState("");
    const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

    const modelsQuery = useQuery({
        queryKey: ["public-model-catalog"],
        queryFn: async () => {
            const response = await elysiaClient.models.get();
            if (response.error) throw new Error("Failed to load models");

            const models = response.data.models as CatalogModel[];
            const withProviders = await Promise.all(
                models.map(async (model) => {
                    const providerResponse = await elysiaClient.models({ id: model.id }).providers.get();
                    return {
                        ...model,
                        providers: providerResponse.error
                            ? []
                            : (providerResponse.data.providers as ModelProvider[]),
                    } satisfies ModelWithProviders;
                })
            );

            return withProviders;
        },
    });

    const models = modelsQuery.data ?? [];
    const filteredModels = useMemo(() => {
        const needle = search.trim().toLowerCase();
        if (!needle) return models;

        return models.filter((model) => {
            const providerNames = model.providers.map((provider) => provider.providerName).join(" ");
            return [model.name, model.slug, model.company.name, providerNames]
                .join(" ")
                .toLowerCase()
                .includes(needle);
        });
    }, [models, search]);

    const copySlug = async (slug: string) => {
        await navigator.clipboard.writeText(slug);
        setCopiedSlug(slug);
        setTimeout(() => setCopiedSlug(null), 1800);
    };

    return (
        <div className="dark min-h-screen bg-background text-foreground">
            <header className="sticky top-0 z-20 border-b border-border/50 bg-background/95 backdrop-blur">
                <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center gap-3">
                        <Button variant="ghost" size="icon-sm" asChild className="text-muted-foreground hover:text-foreground">
                            <Link to="/" aria-label="Back to landing page">
                                <ArrowLeft className="size-4" />
                            </Link>
                        </Button>
                        <Link to="/" className="flex items-center gap-2.5">
                            <div className="flex size-8 items-center justify-center rounded-lg border border-primary/20 bg-primary/10">
                                <Zap className="size-3.5 text-primary" />
                            </div>
                            <span className="text-sm font-semibold tracking-tight">synapse</span>
                        </Link>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
                            <Link to="/docs">Docs</Link>
                        </Button>
                        <Button size="sm" asChild>
                            <Link to="/signup">
                                Create key
                                <ArrowRight className="size-3.5" />
                            </Link>
                        </Button>
                    </div>
                </div>
            </header>

            <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <div className="inline-flex items-center gap-2 rounded-md border border-border/50 bg-card/30 px-2.5 py-1 text-xs text-muted-foreground">
                            <Server className="size-3.5" />
                            Model catalog
                        </div>
                        <h1 className="mt-3 text-2xl font-bold tracking-tight">Models and pricing</h1>
                        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                            Browse public Synapse model slugs, provider coverage, plan gates, and estimated provider pricing per million tokens.
                        </p>
                    </div>
                    <div className="relative w-full lg:w-80">
                        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/60" />
                        <Input
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="Search models, slugs, providers"
                            className="h-10 pl-10"
                        />
                    </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                    <Card className="bg-card/40 border-border/50">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm text-muted-foreground">Catalog size</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-3xl font-bold tracking-tight">{models.length || "—"}</p>
                            <p className="mt-1 text-xs text-muted-foreground">registered models</p>
                        </CardContent>
                    </Card>
                    <Card className="bg-card/40 border-border/50">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm text-muted-foreground">Free access</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-3xl font-bold tracking-tight">
                                {models.filter((model) => model.minPlan === "free").length || "—"}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">available without Pro</p>
                        </CardContent>
                    </Card>
                    <Card className="bg-card/40 border-border/50">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm text-muted-foreground">Gateway features</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-3xl font-bold tracking-tight">SSE</p>
                            <p className="mt-1 text-xs text-muted-foreground">streaming and memory supported</p>
                        </CardContent>
                    </Card>
                </div>

                {modelsQuery.isLoading ? (
                    <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
                        <Loader2 className="size-4 animate-spin" />
                        Loading model catalog...
                    </div>
                ) : modelsQuery.isError ? (
                    <Card className="bg-card/20 border-destructive/30">
                        <CardContent className="pt-6">
                            <p className="text-sm text-destructive">Failed to load models. Make sure the primary backend is running on port 3000.</p>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="overflow-hidden rounded-lg border border-border/50 bg-card/30">
                        <div className="hidden grid-cols-[1.5fr_1fr_0.8fr_0.9fr_0.9fr_9rem] border-b border-border/50 px-4 py-3 text-xs font-medium uppercase text-muted-foreground md:grid">
                            <div>Model</div>
                            <div>Providers</div>
                            <div>Plan</div>
                            <div>Input / 1M</div>
                            <div>Output / 1M</div>
                            <div className="text-right">Slug</div>
                        </div>
                        <div className="divide-y divide-border/40">
                            {filteredModels.map((model) => {
                                const inputPrice = priceRange(model.providers.map((provider) => provider.inputTokenCostNanoDollars));
                                const outputPrice = priceRange(model.providers.map((provider) => provider.outputTokenCostNanoDollars));
                                return (
                                    <div key={model.id} className="grid gap-4 px-4 py-4 md:grid-cols-[1.5fr_1fr_0.8fr_0.9fr_0.9fr_9rem] md:items-center">
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-semibold">{model.name}</p>
                                            <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{model.slug}</p>
                                            <p className="mt-1 text-xs text-muted-foreground">{model.company.name}</p>
                                        </div>
                                        <div className="flex flex-wrap gap-1.5">
                                            {model.providers.length === 0 ? (
                                                <span className="text-xs text-muted-foreground">No providers</span>
                                            ) : (
                                                model.providers.map((provider) => (
                                                    <span key={provider.id} className="rounded-md border border-border/50 bg-background/30 px-2 py-1 text-xs text-muted-foreground">
                                                        {provider.providerName.replace(" API", "")}
                                                    </span>
                                                ))
                                            )}
                                        </div>
                                        <div>
                                            <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-medium capitalize ${planTone(model.minPlan)}`}>
                                                {model.minPlan}
                                            </span>
                                        </div>
                                        <div className="text-sm tabular-nums">
                                            <span className="md:hidden text-muted-foreground">Input: </span>
                                            {inputPrice}
                                        </div>
                                        <div className="text-sm tabular-nums">
                                            <span className="md:hidden text-muted-foreground">Output: </span>
                                            {outputPrice}
                                        </div>
                                        <div className="flex justify-start md:justify-end">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => copySlug(model.slug)}
                                            >
                                                {copiedSlug === model.slug ? (
                                                    <Check className="size-3.5" />
                                                ) : (
                                                    <Copy className="size-3.5" />
                                                )}
                                                Copy
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        {filteredModels.length === 0 && (
                            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                                No models match your search.
                            </div>
                        )}
                    </div>
                )}

                <Card className="bg-card/40 border-border/50">
                    <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-start gap-3">
                            <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border/50 bg-primary/5">
                                <Sparkles className="size-4 text-muted-foreground" />
                            </div>
                            <div>
                                <h2 className="text-sm font-semibold">Ready to call a model?</h2>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    Create an API key, copy a slug, and send your first OpenAI-compatible request through Synapse.
                                </p>
                            </div>
                        </div>
                        <Button asChild>
                            <Link to="/docs">
                                Read integration docs
                                <ArrowRight className="size-3.5" />
                            </Link>
                        </Button>
                    </CardContent>
                </Card>
            </main>
        </div>
    );
}
