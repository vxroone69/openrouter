import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useElysiaClient } from "@/providers/Eden";
import { apiBackendUrl } from "@/config/api";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
    AlertCircle,
    ArrowUpRight,
    Bot,
    CheckCircle2,
    BookmarkPlus,
    Loader2,
    Play,
    Square,
    Sparkles,
    Trash2,
} from "lucide-react";

type StreamUsage = {
    inputTokensConsumed: number;
    outputTokensConsumed: number;
};

type ChatMessage = {
    id: string;
    role: "user" | "assistant";
    content: string;
    usage?: StreamUsage;
    isStreaming?: boolean;
    error?: string;
};

type PlaygroundModel = {
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

type PlaygroundApiKey = {
    id: string;
    name: string;
    apiKey: string;
    creditsConsumed: number;
    lastUsed: string | null;
    disabled: boolean;
};

type MemoryMode = "none" | "user" | "api_key";

const starterPrompts = [
    "Explain streaming responses in one short paragraph.",
    "Write a two-line summary of why model switching is useful.",
    "Give me a fast answer to 1 + 2 and show me the response as it streams.",
];

const defaultModelSlugs = [
    "groq/llama-3.1-8b-instant",
    "groq/llama-3.1-8b-instruct",
    "cloudflare/llama-3.1-8b-instruct",
];

function maskKey(apiKey: string) {
    if (apiKey.length <= 10) return apiKey;
    return `${apiKey.slice(0, 10)}…${apiKey.slice(-4)}`;
}

function parseSSEChunk(chunk: string) {
    return chunk
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
}

export function Playground() {
    const elysiaClient = useElysiaClient();
    const [selectedModel, setSelectedModel] = useState("");
    const [selectedKeyId, setSelectedKeyId] = useState("");
    const [prompt, setPrompt] = useState("");
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isStreaming, setIsStreaming] = useState(false);
    const [status, setStatus] = useState<"idle" | "streaming" | "done" | "error">("idle");
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [lastUsage, setLastUsage] = useState<StreamUsage | null>(null);
    const [lastLatencyMs, setLastLatencyMs] = useState<number | null>(null);
    const [lastTurnPrompt, setLastTurnPrompt] = useState<string>("");
    const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
    const [saveError, setSaveError] = useState<string | null>(null);
    const [memoryMode, setMemoryMode] = useState<MemoryMode>("user");
    const [memoryLimit, setMemoryLimit] = useState("5");
    const [memoryTokenBudget, setMemoryTokenBudget] = useState("500");
    const [showMemoryDebug, setShowMemoryDebug] = useState(false);
    const abortRef = useRef<AbortController | null>(null);
    const transcriptRef = useRef<HTMLDivElement>(null);

    const modelsQuery = useQuery({
        queryKey: ["models"],
        queryFn: async () => {
            const response = await elysiaClient.models.get();
            if (response.error) throw new Error("Failed to fetch models");
            return response.data;
        },
    });

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
        queryFn: async () => {
            const response = await elysiaClient.auth.profile.get();
            if (response.error) throw new Error("Failed to fetch profile");
            return response.data;
        },
    });

    const models = (modelsQuery.data?.models ?? []) as PlaygroundModel[];
    const apiKeys = (apiKeysQuery.data?.apiKeys ?? []) as PlaygroundApiKey[];
    const activeApiKeys = apiKeys.filter((key) => !key.disabled);
    const userPlan = userProfileQuery.data?.plan ?? "free";

    useEffect(() => {
        if (!selectedModel) {
            const preferredModel =
                defaultModelSlugs
                    .map((slug) => models.find((model) => model.slug === slug))
                    .find(Boolean) ??
                models.find((model) => model.slug.includes("llama-3.1-8b")) ??
                models[0];

            if (preferredModel) {
                setSelectedModel(preferredModel.slug);
            }
        }
    }, [models, selectedModel]);

    useEffect(() => {
        const firstApiKey = activeApiKeys[0];
        if (!selectedKeyId && firstApiKey) {
            setSelectedKeyId(firstApiKey.id);
        }
    }, [activeApiKeys, selectedKeyId]);

    useEffect(() => {
        const node = transcriptRef.current;
        if (!node) return;
        node.scrollTop = node.scrollHeight;
    }, [messages, isStreaming]);

    const selectedModelData = useMemo(
        () => models.find((model) => model.slug === selectedModel) ?? null,
        [models, selectedModel]
    );

    const selectedApiKey = useMemo(
        () => apiKeys.find((key) => key.id === selectedKeyId) ?? null,
        [apiKeys, selectedKeyId]
    );

    const clearChat = () => {
        abortRef.current?.abort();
        abortRef.current = null;
        setMessages([]);
        setErrorMessage(null);
        setLastUsage(null);
        setLastLatencyMs(null);
        setLastTurnPrompt("");
        setSaveStatus("idle");
        setSaveError(null);
        setMemoryMode("user");
        setStatus("idle");
        setIsStreaming(false);
    };

    const stopStream = () => {
        abortRef.current?.abort();
        abortRef.current = null;
        setIsStreaming(false);
        setStatus("idle");
    };

    const sendMessage = async (text: string) => {
        const trimmed = text.trim();
        if (!trimmed || isStreaming || !selectedModel || !selectedApiKey) return;

        const nextUserMessage: ChatMessage = {
            id: `user-${crypto.randomUUID()}`,
            role: "user",
            content: trimmed,
        };
        const assistantId = `assistant-${crypto.randomUUID()}`;
        const conversation = [
            ...messages.map((message) => ({
                role: message.role,
                content: message.content,
            })),
            {
                role: "user" as const,
                content: trimmed,
            },
        ];

        setMessages((current) => [
            ...current,
            nextUserMessage,
            {
                id: assistantId,
                role: "assistant",
                content: "",
                isStreaming: true,
            },
        ]);
        setPrompt("");
        setErrorMessage(null);
        setLastUsage(null);
        setLastLatencyMs(null);
        setLastTurnPrompt(trimmed);
        setSaveStatus("idle");
        setSaveError(null);
        setStatus("streaming");
        setIsStreaming(true);

        const startedAt = performance.now();
        const controller = new AbortController();
        abortRef.current = controller;
        const flushPaint = () => new Promise<void>((resolve) => {
            window.requestAnimationFrame(() => resolve());
        });
        let output = "";
        const appendAssistant = (delta: string) => {
            output += delta;
            setMessages((current) =>
                current.map((message) =>
                    message.id === assistantId
                        ? { ...message, content: output, isStreaming: true }
                        : message
                )
            );
        };
        const renderDelta = async (delta: string) => {
            const chunkSize = Math.max(1, Math.min(12, Math.ceil(delta.length / 8)));
            for (let index = 0; index < delta.length; index += chunkSize) {
                appendAssistant(delta.slice(index, index + chunkSize));
                await flushPaint();
            }
        };

        try {
            const url = new URL("/api/v1/chat/completions", apiBackendUrl);
            url.searchParams.set("memory", memoryMode);
            url.searchParams.set("memoryLimit", memoryLimit);
            url.searchParams.set("memoryTokenBudget", memoryTokenBudget);

            const response = await fetch(url.toString(), {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    authorization: `Bearer ${selectedApiKey.apiKey}`,
                },
                body: JSON.stringify({
                    model: selectedModel,
                    stream: true,
                    messages: conversation,
                }),
                signal: controller.signal,
            });

            if (!response.ok) {
                const raw = await response.text();
                let message = raw;
                try {
                    const parsed = JSON.parse(raw) as { message?: string };
                    message = parsed.message ?? raw;
                } catch {
                    // Keep raw body text.
                }
                throw new Error(message || "Failed to start stream");
            }

            const reader = response.body?.getReader();
            if (!reader) {
                throw new Error("Streaming body is unavailable");
            }

            const decoder = new TextDecoder();
            let buffer = "";
            let usage: StreamUsage = { inputTokensConsumed: 0, outputTokensConsumed: 0 };
            let streamDone = false;

            while (!streamDone) {
                const { done, value } = await reader.read();

                if (done) break;

                buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");

                let boundaryIndex = buffer.indexOf("\n\n");
                while (boundaryIndex !== -1) {
                    const rawEvent = buffer.slice(0, boundaryIndex);
                    buffer = buffer.slice(boundaryIndex + 2);

                    const data = parseSSEChunk(rawEvent);
                    if (data === "[DONE]") {
                        streamDone = true;
                        await reader.cancel().catch(() => undefined);
                        boundaryIndex = buffer.indexOf("\n\n");
                        continue;
                    }

                    if (data) {
                        const event = JSON.parse(data) as {
                            choices?: Array<{
                                delta?: { content?: string };
                                finish_reason?: string | null;
                            }>;
                            usage?: {
                                prompt_tokens?: number;
                                completion_tokens?: number;
                            };
                        };

                        const delta = event.choices?.[0]?.delta?.content ?? "";
                        if (delta) {
                            await renderDelta(delta);
                        }

                        if (event.usage) {
                            usage = {
                                inputTokensConsumed: event.usage.prompt_tokens ?? usage.inputTokensConsumed,
                                outputTokensConsumed: event.usage.completion_tokens ?? usage.outputTokensConsumed,
                            };
                        }
                    }

                    boundaryIndex = buffer.indexOf("\n\n");
                }
            }

            const tailEvent = parseSSEChunk(buffer);
            if (tailEvent && tailEvent !== "[DONE]") {
                const event = JSON.parse(tailEvent) as {
                    choices?: Array<{
                        delta?: { content?: string };
                    }>;
                    usage?: {
                        prompt_tokens?: number;
                        completion_tokens?: number;
                    };
                };

                const delta = event.choices?.[0]?.delta?.content ?? "";
                if (delta) {
                    await renderDelta(delta);
                }

                if (event.usage) {
                    usage = {
                        inputTokensConsumed: event.usage.prompt_tokens ?? usage.inputTokensConsumed,
                        outputTokensConsumed: event.usage.completion_tokens ?? usage.outputTokensConsumed,
                    };
                }
            }

            setMessages((current) =>
                current.map((message) =>
                    message.id === assistantId
                        ? {
                              ...message,
                              content: output,
                              isStreaming: false,
                              usage,
                          }
                        : message
                )
            );
            setLastUsage(usage);
            setLastLatencyMs(Math.round(performance.now() - startedAt));
            setStatus("done");
        } catch (error) {
            const isAbort =
                (error instanceof DOMException && error.name === "AbortError") ||
                (error instanceof Error && error.name === "AbortError");

            if (isAbort) {
                setMessages((current) =>
                    current.map((item) =>
                        item.id === assistantId
                            ? {
                                  ...item,
                                  isStreaming: false,
                              }
                            : item
                    )
                );
                setStatus("idle");
                return;
            }

            const message = error instanceof Error ? error.message : "Something went wrong";
            setErrorMessage(message);
            setStatus("error");
            setMessages((current) =>
                current.map((item) =>
                    item.id === assistantId
                        ? {
                              ...item,
                              content: message,
                              isStreaming: false,
                              error: message,
                          }
                        : item
                )
            );
        } finally {
            abortRef.current = null;
            setIsStreaming(false);
        }
    };

    const saveLastTurnAsMemory = async () => {
        if (!lastTurnPrompt.trim() || saveStatus === "saving") return;

        setSaveStatus("saving");
        setSaveError(null);

        try {
            if (!selectedApiKey) {
                throw new Error("Pick an API key first");
            }

            const response = await elysiaClient.memory.post({
                content: lastTurnPrompt.trim(),
                scope: memoryMode === "api_key" ? "project" : "user",
                source: "playground/manual",
                importance: 0.5,
                apiKeyId: memoryMode === "api_key" ? selectedApiKey.id : undefined,
            });

            if (response.error) {
                throw new Error("Failed to save memory");
            }

            setSaveStatus("saved");
        } catch (error) {
            setSaveStatus("error");
            setSaveError(error instanceof Error ? error.message : "Failed to save memory");
        }
    };

    const renderBody = () => {
        if (apiKeysQuery.isLoading || modelsQuery.isLoading) {
            return (
                <div className="flex min-h-[360px] items-center justify-center text-sm text-muted-foreground">
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Loading playground...
                </div>
            );
        }

        if (apiKeysQuery.isError || modelsQuery.isError) {
            return (
                <div className="flex min-h-[360px] items-center justify-center px-6">
                    <div className="flex items-start gap-2.5 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                        <AlertCircle className="mt-0.5 size-4 shrink-0" />
                        <div>
                            <p>Failed to load playground data.</p>
                            <p className="text-xs opacity-80">Refresh the page once the backend is available.</p>
                        </div>
                    </div>
                </div>
            );
        }

        return (
            <div className="grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
                <aside className="space-y-4">
                    <Card className="bg-card/30 border-border/50">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base">Controls</CardTitle>
                            <CardDescription>
                                Choose a model and API key before sending a streamed request.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="model-select">Model</Label>
                                <Select value={selectedModel} onValueChange={setSelectedModel}>
                                    <SelectTrigger id="model-select" className="w-full">
                                        <SelectValue placeholder="Select a model" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {models.map((model) => {
                                            const locked = model.minPlan === "pro" && userPlan !== "pro";
                                            return (
                                            <SelectItem key={model.slug} value={model.slug} disabled={locked}>
                                                <span className="flex items-center gap-2">
                                                    <span className="truncate font-medium">{model.name}</span>
                                                    <span className="text-muted-foreground">·</span>
                                                    <span className="truncate text-muted-foreground">{model.company.name}</span>
                                                    {model.minPlan === "pro" && (
                                                        <span className="rounded border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300">
                                                            Pro
                                                        </span>
                                                    )}
                                                </span>
                                            </SelectItem>
                                        )})}
                                    </SelectContent>
                                </Select>
                                {selectedModelData && (
                                    <p className="text-xs text-muted-foreground">
                                        {selectedModelData.slug}
                                        {selectedModelData.minPlan === "pro" && userPlan !== "pro"
                                            ? " · Upgrade required"
                                            : ""}
                                    </p>
                                )}
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="memory-mode-select">Memory mode</Label>
                                <Select value={memoryMode} onValueChange={(value) => setMemoryMode(value as MemoryMode)}>
                                    <SelectTrigger id="memory-mode-select" className="w-full bg-black/20">
                                        <SelectValue placeholder="Select memory mode" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">No memory</SelectItem>
                                        <SelectItem value="user">User memories only</SelectItem>
                                        <SelectItem value="api_key">API key memories only</SelectItem>
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">
                                    Controls which saved memories are injected into the request.
                                </p>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-2">
                                    <Label htmlFor="memory-limit">Max memories</Label>
                                    <Input
                                        id="memory-limit"
                                        type="number"
                                        min={0}
                                        max={20}
                                        value={memoryLimit}
                                        onChange={(event) => setMemoryLimit(event.target.value)}
                                        className="bg-black/20"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="memory-budget">Token budget</Label>
                                    <Input
                                        id="memory-budget"
                                        type="number"
                                        min={0}
                                        max={4000}
                                        value={memoryTokenBudget}
                                        onChange={(event) => setMemoryTokenBudget(event.target.value)}
                                        className="bg-black/20"
                                    />
                                </div>
                            </div>

                            <label className="flex items-center gap-2 rounded-md border border-border/50 bg-black/20 px-3 py-2 text-xs text-muted-foreground">
                                <input
                                    type="checkbox"
                                    checked={showMemoryDebug}
                                    onChange={(event) => setShowMemoryDebug(event.target.checked)}
                                />
                                Show memory debug controls
                            </label>

                            <div className="space-y-2">
                                <Label htmlFor="api-key-select">API key</Label>
                                <Select value={selectedKeyId} onValueChange={setSelectedKeyId}>
                                    <SelectTrigger id="api-key-select" className="w-full">
                                        <SelectValue placeholder="Select an API key" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {apiKeys.map((key) => (
                                            <SelectItem key={key.id} value={key.id} disabled={key.disabled}>
                                                <span className="flex items-center gap-2">
                                                    <span className="truncate font-medium">{key.name}</span>
                                                    <span className="text-muted-foreground">·</span>
                                                    <span className="font-mono text-muted-foreground">{maskKey(key.apiKey)}</span>
                                                </span>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {selectedApiKey && (
                                    <p className="text-xs text-muted-foreground">
                                        {selectedApiKey.disabled ? "This key is disabled." : "This key will be used for the request."}
                                    </p>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-3 border-t border-border/50 pt-4 text-xs">
                                <div className="rounded-md border border-border/50 bg-black/20 p-3">
                                    <p className="text-muted-foreground">Status</p>
                                    <p className="mt-1 font-medium">
                                        {status === "streaming"
                                            ? "Streaming"
                                            : status === "done"
                                                ? "Ready"
                                                : status === "error"
                                                    ? "Needs attention"
                                                    : "Idle"}
                                    </p>
                                </div>
                                <div className="rounded-md border border-border/50 bg-black/20 p-3">
                                    <p className="text-muted-foreground">Latency</p>
                                    <p className="mt-1 font-medium">
                                        {lastLatencyMs != null ? `${lastLatencyMs} ms` : "—"}
                                    </p>
                                </div>
                                <div className="rounded-md border border-border/50 bg-black/20 p-3">
                                    <p className="text-muted-foreground">Input</p>
                                    <p className="mt-1 font-medium">
                                        {lastUsage ? lastUsage.inputTokensConsumed.toLocaleString() : "—"}
                                    </p>
                                </div>
                                <div className="rounded-md border border-border/50 bg-black/20 p-3">
                                    <p className="text-muted-foreground">Output</p>
                                    <p className="mt-1 font-medium">
                                        {lastUsage ? lastUsage.outputTokensConsumed.toLocaleString() : "—"}
                                    </p>
                                </div>
                            </div>

                            {showMemoryDebug && (
                                <div className="rounded-md border border-border/50 bg-black/20 p-3 text-xs text-muted-foreground">
                                    <p className="font-medium text-foreground">Memory request</p>
                                    <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-[11px]">
{JSON.stringify({
    memory: memoryMode,
    memoryLimit,
    memoryTokenBudget,
}, null, 2)}
                                    </pre>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card className="bg-card/30 border-border/50">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base">Starter prompts</CardTitle>
                            <CardDescription>
                                Click one to drop a ready-made test request into the composer.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            {starterPrompts.map((item) => (
                                <Button
                                    key={item}
                                    type="button"
                                    variant="outline"
                                    className="h-auto w-full justify-start whitespace-normal px-3 py-2 text-left"
                                    onClick={() => setPrompt(item)}
                                >
                                    <Sparkles className="size-4 shrink-0 text-muted-foreground" />
                                    <span className="text-sm font-normal">{item}</span>
                                </Button>
                            ))}
                        </CardContent>
                    </Card>
                </aside>

                <section className="min-h-[72vh] overflow-hidden rounded-xl border border-border/50 bg-card/30 flex flex-col">
                    <div className="flex items-center justify-between gap-3 border-b border-border/50 px-4 py-4 sm:px-5">
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <div className="flex size-8 items-center justify-center rounded-lg border border-primary/20 bg-primary/10">
                                    <Bot className="size-4 text-primary" />
                                </div>
                                <div>
                                    <h1 className="text-sm font-semibold">Chat playground</h1>
                                    <p className="text-xs text-muted-foreground">
                                        Watch the endpoint stream tokens back in real time.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            {isStreaming && (
                                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-400">
                                    <span className="size-1.5 rounded-full bg-emerald-400" />
                                    Streaming
                                </div>
                            )}
                            {status === "done" && !isStreaming && (
                                <div className="inline-flex items-center gap-2 rounded-full border border-border/50 bg-black/20 px-3 py-1 text-xs text-muted-foreground">
                                    <CheckCircle2 className="size-3.5 text-emerald-400" />
                                    Complete
                                </div>
                            )}
                            <Button variant="ghost" size="sm" onClick={clearChat}>
                                <Trash2 className="size-3.5" />
                                Clear
                            </Button>
                        </div>
                    </div>

                    <div ref={transcriptRef} className="flex-1 overflow-y-auto px-4 py-5 sm:px-5">
                        {messages.length === 0 ? (
                            <div className="flex min-h-[46vh] items-center justify-center">
                                <div className="max-w-md text-center">
                                    <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full border border-white/10 bg-white/5">
                                        <Play className="size-5 text-muted-foreground" />
                                    </div>
                                    <h2 className="text-lg font-semibold">Ready when you are</h2>
                                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                                        Pick a model, choose a key, then send a prompt to watch the response arrive chunk by chunk.
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {messages.map((message) => {
                                    const isUser = message.role === "user";
                                    return (
                                        <div
                                            key={message.id}
                                            className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                                        >
                                            <div
                                                className={`max-w-[min(88%,48rem)] rounded-2xl border px-4 py-3 text-sm leading-6 ${
                                                    isUser
                                                        ? "border-primary/20 bg-primary/10 text-white"
                                                        : message.error
                                                            ? "border-destructive/20 bg-destructive/10 text-destructive"
                                                            : "border-border/50 bg-black/20 text-white"
                                                }`}
                                            >
                                                <div className="mb-2 flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.16em] text-white/60">
                                                    <span>{isUser ? "You" : "Assistant"}</span>
                                                    {message.isStreaming && (
                                                        <span className="flex items-center gap-1 text-emerald-400">
                                                            <Loader2 className="size-3 animate-spin" />
                                                            typing
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="whitespace-pre-wrap break-words">
                                                    {message.content || (message.isStreaming ? "…" : "")}
                                                </div>
                                                {message.usage && !message.isStreaming && !message.error && (
                                                    <div className="mt-3 flex items-center gap-3 text-[11px] text-muted-foreground">
                                                        <span>{message.usage.inputTokensConsumed} input</span>
                                                        <span>{message.usage.outputTokensConsumed} output</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <div className="border-t border-border/50 p-4 sm:p-5">
                        <form
                            className="space-y-3"
                            onSubmit={(event) => {
                                event.preventDefault();
                                void sendMessage(prompt);
                            }}
                        >
                            <Textarea
                                value={prompt}
                                onChange={(event) => setPrompt(event.target.value)}
                                placeholder="Ask something and watch it stream back here..."
                                className="min-h-28 resize-none bg-black/20 text-white placeholder:text-white/40"
                                onKeyDown={(event) => {
                                    if (event.key === "Enter" && !event.shiftKey) {
                                        event.preventDefault();
                                        void sendMessage(prompt);
                                    }
                                }}
                                disabled={isStreaming}
                            />

                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <ArrowUpRight className="size-3.5" />
                                    POST /api/v1/chat/completions
                                    {selectedModelData && (
                                        <span className="rounded-full border border-border/50 bg-black/20 px-2 py-1 font-mono text-[11px]">
                                            {selectedModelData.slug}
                                        </span>
                                    )}
                                </div>

                            <div className="flex items-center gap-2">
                                {isStreaming ? (
                                    <Button type="button" variant="outline" onClick={stopStream}>
                                        <Square className="size-3.5" />
                                        Stop
                                    </Button>
                                    ) : (
                                        <Button
                                            type="submit"
                                            disabled={
                                                !prompt.trim() ||
                                                !selectedModel ||
                                                !selectedApiKey ||
                                                selectedApiKey.disabled ||
                                                (selectedModelData?.minPlan === "pro" && userPlan !== "pro")
                                            }
                                        >
                                            <Play className="size-3.5" />
                                            Send
                                        </Button>
                                    )}
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => void saveLastTurnAsMemory()}
                                        disabled={!lastTurnPrompt.trim() || saveStatus === "saving"}
                                    >
                                        <BookmarkPlus className="size-3.5" />
                                        {saveStatus === "saving"
                                            ? "Saving"
                                            : saveStatus === "saved"
                                                ? "Saved"
                                                : "Save memory"}
                                    </Button>
                                </div>
                            </div>

                            {selectedApiKey?.disabled && (
                                <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3.5 py-3 text-sm text-amber-400">
                                    <AlertCircle className="mt-0.5 size-4 shrink-0" />
                                    <span>This key is disabled. Pick an active key to test the endpoint.</span>
                                </div>
                            )}

                            {errorMessage && status === "error" && (
                                <div className="flex items-start gap-2.5 rounded-lg border border-destructive/20 bg-destructive/10 px-3.5 py-3 text-sm text-destructive">
                                    <AlertCircle className="mt-0.5 size-4 shrink-0" />
                                    <span>{errorMessage}</span>
                                </div>
                            )}

                            {saveError && saveStatus === "error" && (
                                <div className="flex items-start gap-2.5 rounded-lg border border-destructive/20 bg-destructive/10 px-3.5 py-3 text-sm text-destructive">
                                    <AlertCircle className="mt-0.5 size-4 shrink-0" />
                                    <span>{saveError}</span>
                                </div>
                            )}
                        </form>
                    </div>
                </section>
            </div>
        );
    };

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div className="flex flex-col gap-2">
                    <h1 className="text-2xl font-bold tracking-tight">Playground</h1>
                    <p className="max-w-2xl text-sm text-muted-foreground">
                        This is a live test bench for your chat completions endpoint.
                        It uses one of your API keys, lets you switch models, and shows the response streaming in piece by piece.
                    </p>
                </div>

                {renderBody()}
            </div>
        </DashboardLayout>
    );
}
