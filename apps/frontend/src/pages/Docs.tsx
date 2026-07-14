import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Activity,
    ArrowLeft,
    ArrowRight,
    BookOpen,
    Brain,
    Coins,
    Key,
    MessageSquareText,
    ShieldCheck,
    Terminal,
    Zap,
} from "lucide-react";

const features = [
    {
        icon: Key,
        title: "API key lifecycle",
        body: "Create named keys for each app or environment, copy the secret at creation time, reveal masked keys for local verification, disable keys without deleting history, and permanently delete keys that should no longer authenticate gateway traffic.",
    },
    {
        icon: MessageSquareText,
        title: "Streaming playground",
        body: "Test the gateway from the browser with a selected API key, model, memory mode, memory limit, and token budget. Responses stream into the transcript so you can validate latency, output shape, cancellation, and memory behavior before wiring a real client.",
    },
    {
        icon: Brain,
        title: "Memory layer",
        body: "Synapse can retrieve relevant user-level or API-key-level memories, inject them as cacheable context, record which memories were used, and write new memories after successful chat turns. The Memory page lets developers search, edit, archive, restore, merge duplicates, compress selected memories, run automatic compression, and inspect request-level memory traces.",
    },
    {
        icon: Activity,
        title: "Analytics console",
        body: "Request logs are summarized across 24-hour, 7-day, and 30-day windows. The console shows request volume, token totals, cost, success rate, latency, time to first token, failure mix, recent errors, and breakdowns by model, provider, or API key.",
    },
    {
        icon: Coins,
        title: "Credits and plans",
        body: "Every successful completion decrements user credits based on provider token cost, cache savings, and markup settings. The Credits page shows current balance, per-key consumption, mock credit packages, and Pro upgrade status for higher-cost models.",
    },
    {
        icon: ShieldCheck,
        title: "Gateway guardrails",
        body: "The gateway validates bearer keys, rejects disabled or deleted keys, checks credit balance, enforces per-key rate limits, verifies model support and plan access, and records denied requests so failures stay observable.",
    },
];

const gatewaySteps = [
    "Create or choose an API key in Synapse. Use one key per app, environment, or customer boundary so usage stays readable.",
    "Send requests to the API backend at /api/v1/chat/completions. In local development the default gateway URL is http://localhost:3002.",
    "Pass the Synapse key as a bearer token. The frontend account cookie is only for the dashboard; server-to-server gateway calls use Authorization: Bearer.",
    "Use a model slug in provider/model format, for example groq/llama-3.1-8b-instant. The gateway finds the configured provider mappings and falls back across mapped providers when possible.",
    "Set stream: true for OpenAI-style server-sent events, or omit stream for a standard JSON chat completion response.",
    "Optionally tune memory with query parameters: memory=none, memory=user, or memory=api_key; memoryLimit controls the number of memories; memoryTokenBudget caps injected context.",
];

const errors = [
    ["403 Invalid API Key", "The bearer token is missing, disabled, deleted, or unknown."],
    ["403 Insufficient Credits", "The authenticated user has no remaining credits."],
    ["403 Unsupported Model", "The requested model slug is not registered in Synapse."],
    ["402 Pro required", "The model is gated behind the Pro plan."],
    ["429 Rate limit exceeded", "The API key exceeded the configured sliding-window limit."],
    ["503 All providers failed", "Every mapped provider failed for this request after fallback attempts."],
];

export function Docs() {
    return (
        <div className="dark min-h-screen bg-background text-foreground">
            <header className="sticky top-0 z-20 border-b border-border/50 bg-background/95 backdrop-blur">
                <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6 lg:px-8">
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
                            <Link to="/signin">Sign in</Link>
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

            <main className="mx-auto max-w-5xl space-y-8 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <div className="inline-flex items-center gap-2 rounded-md border border-border/50 bg-card/30 px-2.5 py-1 text-xs text-muted-foreground">
                            <BookOpen className="size-3.5" />
                            Synapse docs
                        </div>
                        <h1 className="mt-3 text-2xl font-bold tracking-tight">Build on the Synapse gateway</h1>
                        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                            Synapse is a local OpenRouter-style control plane for keys, credits, memory, analytics, and chat completions through one OpenAI-compatible endpoint.
                        </p>
                    </div>
                    <Button variant="outline" size="sm" asChild>
                        <Link to="/signup">
                            Get started
                            <ArrowRight className="size-3.5" />
                        </Link>
                    </Button>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                    {features.map((feature) => (
                        <Card key={feature.title} className="bg-card/40 border-border/50">
                            <CardHeader>
                                <div className="mb-1 flex size-9 items-center justify-center rounded-md border border-border/50 bg-primary/5">
                                    <feature.icon className="size-4 text-muted-foreground" />
                                </div>
                                <CardTitle className="text-base">{feature.title}</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-sm leading-6 text-muted-foreground">{feature.body}</p>
                            </CardContent>
                        </Card>
                    ))}
                </div>

                <Card className="bg-card/40 border-border/50">
                    <CardHeader>
                        <div className="flex items-center gap-2">
                            <Terminal className="size-4 text-muted-foreground" />
                            <CardTitle className="text-lg">Gateway Integration</CardTitle>
                        </div>
                        <CardDescription>
                            Use this flow when connecting a backend service, CLI, worker, or product feature to Synapse.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="grid gap-3">
                            {gatewaySteps.map((step, index) => (
                                <div key={step} className="grid grid-cols-[2rem_1fr] gap-3 rounded-md border border-border/40 bg-background/30 px-3 py-3">
                                    <div className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-xs font-semibold text-primary">
                                        {index + 1}
                                    </div>
                                    <p className="text-sm leading-6 text-muted-foreground">{step}</p>
                                </div>
                            ))}
                        </div>

                        <div className="rounded-md border border-border/50 bg-background/50 p-4">
                            <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                                <Zap className="size-4 text-muted-foreground" />
                                Streaming request
                            </div>
                            <pre className="overflow-x-auto rounded-md bg-black/40 p-4 text-xs leading-5 text-white/80"><code>{`curl http://localhost:3002/api/v1/chat/completions?memory=user&memoryLimit=5&memoryTokenBudget=500 \\
  -H "Authorization: Bearer $SYNAPSE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "groq/llama-3.1-8b-instant",
    "stream": true,
    "messages": [
      { "role": "user", "content": "Give me a concise launch checklist." }
    ]
  }'`}</code></pre>
                        </div>

                        <div className="rounded-md border border-border/50 bg-background/50 p-4">
                            <div className="mb-3 text-sm font-medium">JavaScript example</div>
                            <pre className="overflow-x-auto rounded-md bg-black/40 p-4 text-xs leading-5 text-white/80"><code>{`const response = await fetch(
  "http://localhost:3002/api/v1/chat/completions?memory=api_key",
  {
    method: "POST",
    headers: {
      Authorization: \`Bearer \${process.env.SYNAPSE_API_KEY}\`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "groq/llama-3.1-8b-instant",
      messages: [{ role: "user", content: "Summarize today's usage." }],
    }),
  }
);

if (!response.ok) {
  throw new Error(await response.text());
}

const completion = await response.json();`}</code></pre>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-card/40 border-border/50">
                    <CardHeader>
                        <CardTitle className="text-lg">Operational Behavior</CardTitle>
                        <CardDescription>
                            What Synapse records and how developers should interpret gateway responses.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4 md:grid-cols-2">
                        <div className="rounded-md border border-border/40 bg-background/30 p-4">
                            <h2 className="text-sm font-semibold">Accounting</h2>
                            <p className="mt-2 text-sm leading-6 text-muted-foreground">
                                Successful requests update the API key last-used time, increment key credits consumed, decrement user credits, store a conversation record, and schedule an analytics log with provider, fallback count, latency, tokens, cost, cache savings, and memory details.
                            </p>
                        </div>
                        <div className="rounded-md border border-border/40 bg-background/30 p-4">
                            <h2 className="text-sm font-semibold">Memory defaults</h2>
                            <p className="mt-2 text-sm leading-6 text-muted-foreground">
                                Memory is enabled by default with user scope. Use memory=none for stateless calls, memory=user for account-wide context, and memory=api_key when context should stay tied to the calling key.
                            </p>
                        </div>
                        <div className="rounded-md border border-border/40 bg-background/30 p-4 md:col-span-2">
                            <h2 className="text-sm font-semibold">Common errors</h2>
                            <div className="mt-3 overflow-hidden rounded-md border border-border/40">
                                {errors.map(([label, description]) => (
                                    <div key={label} className="grid gap-1 border-b border-border/30 px-3 py-2 text-sm last:border-0 sm:grid-cols-[12rem_1fr]">
                                        <span className="font-mono text-xs text-foreground">{label}</span>
                                        <span className="text-muted-foreground">{description}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </main>
        </div>
    );
}
