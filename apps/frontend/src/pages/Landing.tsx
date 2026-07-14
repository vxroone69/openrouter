import { useQuery } from "@tanstack/react-query";
import { Link, Navigate, useSearchParams } from "react-router";
import { useElysiaClient } from "@/providers/Eden";
import { Button } from "@/components/ui/button";
import {
    ArrowRight,
    BarChart3,
    BookOpen,
    Code2,
    Github,
    KeyRound,
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
        icon: BookOpen,
        title: "Developer docs",
        description: "Follow examples for gateway auth, streaming calls, memory, billing, and errors.",
    },
    {
        icon: BarChart3,
        title: "Usage ledger",
        description: "Track token consumption, credits, and last-used activity per key.",
    },
];

const heroLogos = [
    { label: "Stripe", mark: "stripe" },
    { label: "Render", mark: "render" },
    { label: "Vercel", mark: "vercel" },
];

function BrandMark({ mark }: { mark: string }) {
    if (mark === "render") {
        return (
            <span className="grid size-5 grid-cols-2 grid-rows-2 gap-1" aria-hidden="true">
                <span className="rounded-[1px] bg-current" />
                <span className="rounded-[1px] bg-current" />
                <span className="rounded-[1px] bg-current" />
                <span className="rounded-[1px] bg-current opacity-35" />
            </span>
        );
    }

    if (mark === "vercel") {
        return (
            <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 fill-current">
                <path d="M12 4 22 20H2L12 4Z" />
            </svg>
        );
    }

    return (
        <span className="flex h-5 w-8 items-center justify-center rounded bg-current text-[10px] font-black tracking-[-0.06em] text-black" aria-hidden="true">
            S
        </span>
    );
}

export function Landing() {
    const elysiaClient = useElysiaClient();
    const [searchParams] = useSearchParams();
    const showPublicLanding = searchParams.get("public") === "1";
    const profileQuery = useQuery({
        queryKey: ["user-profile"],
        queryFn: async () => {
            const response = await elysiaClient.auth.profile.get();
            if (response.error) throw new Error("Unauthorized");
            return response.data;
        },
        retry: false,
        staleTime: 15_000,
    });

    if (profileQuery.isSuccess && !showPublicLanding) {
        return <Navigate to="/dashboard" replace />;
    }

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
                        <Link to="/docs" className="transition-colors hover:text-foreground">
                            Docs
                        </Link>
                        <Link to="/models" className="transition-colors hover:text-foreground">
                            Models
                        </Link>
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
                                    docs
                                </div>
                                <p className="mt-1 text-sm text-muted-foreground">gateway guide included</p>
                                <div className="mt-8 flex items-center gap-2">
                                    {[
                                        { icon: KeyRound, label: "Keys" },
                                        { icon: BookOpen, label: "Docs" },
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
                                        One API, controlled by you.
                                    </h2>
                                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                                        Route requests through your own keys, credits, memory, and request logs.
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
                                    <Link to="/docs">Read docs</Link>
                                </Button>
                            </div>
                        </div>

                        <aside className="order-3 space-y-4">
                            <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl">
                                <div className="rounded-md border border-white/10 bg-black/30 p-4">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                            <ShieldCheck className="size-4 text-white/80" />
                                            live gateway call
                                        </div>
                                        <span className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-300">
                                            200 OK
                                        </span>
                                    </div>

                                    <div className="mt-5 rounded-md border border-white/10 bg-black/25 px-3 py-2">
                                        <p className="text-[11px] uppercase text-muted-foreground">model</p>
                                        <p className="mt-1 truncate font-mono text-xs text-white/85">
                                            groq/llama-3.1-8b-instant
                                        </p>
                                    </div>

                                    <div className="mt-3 grid grid-cols-2 gap-2">
                                        {[
                                            { label: "provider", value: "Groq API" },
                                            { label: "fallback", value: "0 hops" },
                                            { label: "memory", value: "5 notes" },
                                            { label: "ttft", value: "214 ms" },
                                        ].map((item) => (
                                            <div key={item.label} className="rounded-md border border-white/10 bg-white/[0.035] px-3 py-2">
                                                <p className="text-[10px] uppercase text-muted-foreground">{item.label}</p>
                                                <p className="mt-1 truncate text-xs font-medium text-white/85">{item.value}</p>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="mt-4 rounded-md border border-white/10 bg-white/[0.035] p-3">
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="text-muted-foreground">credits charged</span>
                                            <span className="font-medium text-white/85">18</span>
                                        </div>
                                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                                            <div className="h-full w-[62%] rounded-full bg-white/80" />
                                        </div>
                                        <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                                            <span>cached input saved</span>
                                            <span>42%</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
                                <div className="flex items-center justify-between text-xs text-muted-foreground">
                                    <span>developer path</span>
                                    <BookOpen className="size-3.5" />
                                </div>
                                <div className="mt-4 space-y-2">
                                    {[
                                        { id: "1", title: "Create an API key", detail: "Name keys by app or environment" },
                                        { id: "2", title: "Call the gateway", detail: "POST /api/v1/chat/completions" },
                                        { id: "3", title: "Tune memory", detail: "Use memory query parameters" },
                                    ].map((item) => (
                                        <div key={item.id} className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-black/20 px-3 py-2">
                                            <div className="min-w-0">
                                                <p className="truncate text-xs font-medium">{item.title}</p>
                                                <p className="text-[11px] text-muted-foreground">{item.detail}</p>
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

                    <div className="relative z-20 mx-auto mt-6 flex max-w-3xl flex-col items-center gap-3 text-white/55 sm:mt-8">
                        <p className="text-xs font-medium uppercase text-muted-foreground">
                            Connected infrastructure
                        </p>
                        <div className="grid w-full grid-cols-1 overflow-hidden rounded-lg border border-white/10 bg-black/25 backdrop-blur-xl sm:grid-cols-3">
                            {heroLogos.map(({ label, mark }) => (
                                <div
                                    key={label}
                                    className="flex h-16 items-center justify-center gap-3 border-b border-white/10 px-5 text-white/70 transition-colors last:border-b-0 hover:text-white sm:border-b-0 sm:border-r sm:last:border-r-0"
                                    title={label}
                                    aria-label={label}
                                >
                                    <BrandMark mark={mark} />
                                    <span className="text-xl font-semibold tracking-tight">
                                        {label}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                <footer className="relative z-10 flex flex-col gap-4 border-t border-white/10 px-5 py-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-12">
                    <div className="flex items-center gap-2">
                        <Zap className="size-3.5" />
                        <span>synapse</span>
                    </div>
                    <div className="flex items-center gap-4">
                        <Link to="/docs" className="hover:text-foreground">Docs</Link>
                        <Link to="/models" className="hover:text-foreground">Models</Link>
                        <Github className="size-4" />
                    </div>
                </footer>
            </main>

            <section id="usage" className="mx-auto grid max-w-7xl grid-cols-1 gap-4 px-2 py-5 md:grid-cols-3">
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
