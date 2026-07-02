import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useElysiaClient } from "@/providers/Eden";
import { Button } from "@/components/ui/button";
import {
    ArrowRight,
    BarChart3,
    Code2,
    Github,
    Globe2,
    KeyRound,
    Layers,
    Mail,
    Radio,
    ShieldCheck,
    Zap,
} from "lucide-react";

const featureCards = [
    {
        icon: KeyRound,
        title: "Key control",
        description: "Create, disable, delete, and monitor API keys from one dashboard.",
    },
    {
        icon: Layers,
        title: "Model routing",
        description: "Map models to providers and send requests through a single endpoint.",
    },
    {
        icon: BarChart3,
        title: "Usage ledger",
        description: "Track token consumption, credits, and last-used activity per key.",
    },
];

export function Landing() {
    const elysiaClient = useElysiaClient();

    const modelsQuery = useQuery({
        queryKey: ["models"],
        queryFn: async () => {
            const response = await elysiaClient.models.get();
            if (response.error) return null;
            return response.data;
        },
    });

    const modelCount = modelsQuery.data?.models?.length ?? 0;
    const previewModels = modelsQuery.data?.models?.slice(0, 4) ?? [];

    return (
        <div className="dark min-h-screen bg-[#080909] text-foreground px-3 py-3 sm:px-5 sm:py-5">
            <main className="relative min-h-[calc(100vh-24px)] overflow-hidden rounded-[28px] border border-white/10 bg-[#0b0d0c] shadow-2xl shadow-black/40 sm:min-h-[calc(100vh-40px)]">
                <div
                    className="absolute inset-0 opacity-[0.18]"
                    style={{
                        backgroundImage:
                            "linear-gradient(oklch(1 0 0 / 0.06) 1px, transparent 1px), linear-gradient(90deg, oklch(1 0 0 / 0.06) 1px, transparent 1px)",
                        backgroundSize: "46px 46px",
                    }}
                />
                <div className="absolute inset-x-8 top-24 h-px bg-white/10" />
                <div className="absolute inset-x-8 bottom-24 h-px bg-white/10" />
                <div className="absolute left-[8%] top-[18%] h-[58%] w-px bg-white/10" />
                <div className="absolute right-[8%] top-[18%] h-[58%] w-px bg-white/10" />

                <header className="relative z-20 flex h-20 items-center justify-between px-5 sm:px-8 lg:px-12">
                    <Link to="/" className="flex items-center gap-2.5">
                        <div className="flex size-9 items-center justify-center rounded-lg border border-white/15 bg-white/[0.04]">
                            <Zap className="size-4 text-white" />
                        </div>
                        <span className="text-base font-semibold tracking-tight">synapse</span>
                    </Link>

                    <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
                        <a href="#routing" className="transition-colors hover:text-foreground">
                            Routing
                        </a>
                        <a href="#models" className="transition-colors hover:text-foreground">
                            Models
                        </a>
                        <a href="#usage" className="transition-colors hover:text-foreground">
                            Usage
                        </a>
                    </nav>

                    <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
                            <Link to="/signin">Sign in</Link>
                        </Button>
                        <Button size="sm" asChild className="bg-white text-black hover:bg-white/90">
                            <Link to="/signup">
                                Start
                                <ArrowRight className="size-3.5" />
                            </Link>
                        </Button>
                    </div>
                </header>

                <section className="relative z-10 min-h-[calc(100vh-104px)] px-5 pb-8 sm:px-8 lg:px-12">
                    <div className="pointer-events-none absolute inset-x-0 top-[8%] flex justify-center overflow-hidden">
                        <div className="select-none text-[22vw] font-black leading-none tracking-[-0.08em] text-white/[0.08] blur-[1px]">
                            synapse
                        </div>
                    </div>

                    <div className="relative mx-auto grid min-h-[calc(100vh-136px)] max-w-7xl grid-cols-1 items-center gap-8 lg:grid-cols-[330px_1fr_300px]">
                        <aside className="order-2 space-y-4 lg:order-1">
                            <div className="rounded-lg border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl">
                                <div className="text-5xl font-semibold tracking-tight tabular-nums">
                                    {modelCount || "—"}
                                </div>
                                <p className="mt-1 text-sm text-muted-foreground">models indexed</p>
                                <div className="mt-8 flex items-center gap-2">
                                    {[
                                        { icon: KeyRound, label: "Keys" },
                                        { icon: Layers, label: "Models" },
                                        { icon: BarChart3, label: "Usage" },
                                    ].map(({ icon: Icon, label }) => (
                                        <div
                                            key={label}
                                            className="flex size-10 items-center justify-center rounded-full border border-white/15 bg-black/20"
                                            title={label}
                                        >
                                            <Icon className="size-4 text-white/80" />
                                        </div>
                                    ))}
                                </div>
                                <div className="mt-8 border-t border-white/10 pt-5">
                                    <h2 className="text-xl font-medium tracking-tight">
                                        Route, meter, observe.
                                    </h2>
                                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                                        A local OpenRouter-style control plane for experimenting with provider routing.
                                    </p>
                                </div>
                            </div>

                            <div className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
                                <div className="flex items-center justify-between text-xs text-muted-foreground">
                                    <span>API endpoint</span>
                                    <Radio className="size-3.5" />
                                </div>
                                <code className="mt-3 block truncate rounded-md border border-white/10 bg-black/30 px-3 py-2 text-xs text-white/80">
                                    /api/v1/chat/completions
                                </code>
                            </div>
                        </aside>

                        <div className="order-1 flex min-h-[480px] flex-col items-center justify-center text-center lg:order-2">
                            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-muted-foreground">
                                <span className="size-1.5 rounded-full bg-white" />
                                local gateway online
                            </div>
                            <h1 className="max-w-3xl text-5xl font-semibold tracking-[-0.04em] sm:text-7xl lg:text-8xl">
                                One console for model access.
                            </h1>
                            <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
                                Manage keys, credits, provider mappings, and chat completions through a compact developer dashboard.
                            </p>
                            <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row">
                                <Button size="lg" asChild className="h-12 bg-white px-7 text-black hover:bg-white/90">
                                    <Link to="/signup">
                                        Create account
                                        <ArrowRight className="size-4" />
                                    </Link>
                                </Button>
                                <Button variant="outline" size="lg" asChild className="h-12 border-white/15 bg-white/[0.03] px-7">
                                    <Link to="/dashboard">Open dashboard</Link>
                                </Button>
                            </div>
                        </div>

                        <aside className="order-3 space-y-4">
                            <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl">
                                <div className="aspect-[4/3] rounded-md border border-white/10 bg-black/30 p-4">
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                        <ShieldCheck className="size-4 text-white/80" />
                                        active route
                                    </div>
                                    <div className="mt-8 space-y-3">
                                        <div className="h-2 w-3/4 rounded-full bg-white/70" />
                                        <div className="h-2 w-1/2 rounded-full bg-white/25" />
                                        <div className="h-2 w-2/3 rounded-full bg-white/15" />
                                    </div>
                                    <div className="mt-8 flex gap-2">
                                        <span className="h-1.5 w-10 rounded-full bg-white" />
                                        <span className="h-1.5 w-5 rounded-full bg-white/25" />
                                        <span className="h-1.5 w-5 rounded-full bg-white/15" />
                                    </div>
                                </div>
                            </div>

                            <div id="models" className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
                                <div className="flex items-center justify-between text-xs text-muted-foreground">
                                    <span>recent models</span>
                                    <Globe2 className="size-3.5" />
                                </div>
                                <div className="mt-4 space-y-2">
                                    {(previewModels.length > 0 ? previewModels : [
                                        { id: "1", name: "gemini-3-flash-preview", company: { name: "Google" } },
                                        { id: "2", name: "gpt-4o-mini", company: { name: "OpenAI" } },
                                        { id: "3", name: "claude-sonnet", company: { name: "Anthropic" } },
                                    ]).map((model) => (
                                        <div key={model.id} className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-black/20 px-3 py-2">
                                            <div className="min-w-0">
                                                <p className="truncate text-xs font-medium">{model.name}</p>
                                                <p className="text-[11px] text-muted-foreground">{model.company.name}</p>
                                            </div>
                                            <Code2 className="size-3.5 shrink-0 text-muted-foreground" />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </aside>
                    </div>

                    <div className="relative z-20 mx-auto flex max-w-xl items-center rounded-full border border-white/15 bg-black/40 p-1.5 backdrop-blur-xl">
                        <Mail className="ml-4 size-4 text-muted-foreground" />
                        <input
                            aria-label="Email"
                            placeholder="Your email"
                            className="h-10 min-w-0 flex-1 bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground"
                        />
                        <Button asChild className="h-10 rounded-full bg-white px-6 text-black hover:bg-white/90">
                            <Link to="/signup">Submit</Link>
                        </Button>
                    </div>
                </section>

                <footer className="relative z-10 flex flex-col gap-4 border-t border-white/10 px-5 py-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-12">
                    <div className="flex items-center gap-2">
                        <Zap className="size-3.5" />
                        <span>synapse</span>
                    </div>
                    <div className="flex items-center gap-4">
                        <a href="#routing" className="hover:text-foreground">Routing</a>
                        <a href="#usage" className="hover:text-foreground">Usage</a>
                        <Github className="size-4" />
                    </div>
                </footer>
            </main>

            <section id="routing" className="mx-auto grid max-w-7xl grid-cols-1 gap-4 px-2 py-5 md:grid-cols-3">
                {featureCards.map((feature) => (
                    <div key={feature.title} className="rounded-lg border border-white/10 bg-white/[0.035] p-5">
                        <feature.icon className="size-5 text-white/80" />
                        <h2 className="mt-4 text-sm font-semibold">{feature.title}</h2>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">{feature.description}</p>
                    </div>
                ))}
            </section>
        </div>
    );
}
