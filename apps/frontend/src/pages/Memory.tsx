import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useElysiaClient } from "@/providers/Eden";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { AlertCircle, Archive, GitMerge, Loader2, RefreshCw, Save, Search, Trash2, Undo2, Zap } from "lucide-react";

type ApiKey = {
    id: string;
    name: string;
    apiKey: string;
    disabled: boolean;
};

type MemoryRow = {
    id: string;
    userId: string;
    apiKeyId: string | null;
    scope: "conversation" | "user" | "project" | "semantic";
    content: string;
    source: string | null;
    savedBy: "manual" | "rule" | "llm" | "compression";
    reasoning: string | null;
    confidence: number;
    importance: number;
    compressedFrom: unknown;
    compressedIntoId: string | null;
    isCompressed: boolean;
    enabled: boolean;
    archived: boolean;
    archivedAt: string | null;
    createdAt: string;
    updatedAt: string;
    lastUsedAt: string | null;
};

type MemoryResponse = {
    memories: MemoryRow[];
};

type RequestTrace = {
    request: {
        id: string;
        model: string;
        provider: string | null;
        createdAt: string;
    };
    injection: {
        considered: number;
        injected: number;
        notInjected: number;
    };
    injectedMemories: Array<{
        memoryId: number;
        content?: string;
        relevanceScore?: number | null;
        estimatedTokens?: number | null;
        isCompressed?: boolean;
        factors?: Record<string, number> | null;
    }>;
    cost: {
        inputTokens: number;
        outputTokens: number;
        cachedInputTokens: number;
        regularInputTokens: number;
        baseCost: number;
        memoryCost: number;
        cachingSavings: number;
        totalRequestCost: number;
        breakdown: unknown;
    };
};

type MemoryView = "user" | "api_key";

function formatDate(value: string | null) {
    if (!value) return "Never";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Never";
    return new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    }).format(date);
}

function scopeTone(scope: MemoryRow["scope"]) {
    switch (scope) {
        case "user":
            return "border-sky-500/20 bg-sky-500/10 text-sky-300";
        case "conversation":
            return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300";
        case "project":
            return "border-violet-500/20 bg-violet-500/10 text-violet-300";
        case "semantic":
            return "border-amber-500/20 bg-amber-500/10 text-amber-300";
    }
}

export function Memory() {
    const elysiaClient = useElysiaClient();
    const queryClient = useQueryClient();
    const [memoryView, setMemoryView] = useState<MemoryView>("user");
    const [selectedApiKeyId, setSelectedApiKeyId] = useState<string>("");
    const [search, setSearch] = useState("");
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editContent, setEditContent] = useState("");
    const [editImportance, setEditImportance] = useState("1");
    const [editArchived, setEditArchived] = useState(false);
    const [selectedMemoryIds, setSelectedMemoryIds] = useState<string[]>([]);
    const [duplicateRows, setDuplicateRows] = useState<Array<{ memoryId: number; duplicateId: number; similarity: number }>>([]);
    const [traceRequestId, setTraceRequestId] = useState("");
    const [requestTrace, setRequestTrace] = useState<RequestTrace | null>(null);

    const apiKeysQuery = useQuery({
        queryKey: ["api-keys"],
        queryFn: async () => {
            const response = await elysiaClient["api-keys"].get();
            if (response.error) throw new Error("Failed to load API keys");
            return response.data;
        },
    });

    const memoriesQuery = useQuery({
        queryKey: ["memories", memoryView, selectedApiKeyId],
        queryFn: async () => {
            const response = await elysiaClient.memory.get({
                query: {
                    scope: memoryView,
                    apiKeyId: memoryView === "api_key" ? selectedApiKeyId || undefined : undefined,
                },
            });
            if (response.error) throw new Error("Failed to load memories");
            return response.data as MemoryResponse;
        },
    });

    const updateMutation = useMutation({
        mutationFn: async (payload: {
            id: string;
            content: string;
            importance: number;
            archived: boolean;
        }) => {
            const response = await elysiaClient.memory.put({
                id: payload.id,
                content: payload.content,
                importance: payload.importance,
                archived: payload.archived,
            });

            if (response.error) {
                throw new Error("Failed to update memory");
            }

            return response.data;
        },
        onSuccess: () => {
            setEditingId(null);
            queryClient.invalidateQueries({ queryKey: ["memories"] });
        },
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            const response = await elysiaClient.memory({ id }).delete();
            if (response.error) {
                throw new Error("Failed to delete memory");
            }
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["memories"] });
        },
    });

    const archiveMutation = useMutation({
        mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
            const response = archived
                ? await elysiaClient.memory({ id }).restore.post()
                : await elysiaClient.memory({ id }).archive.post();
            if (response.error) throw new Error("Failed to update archive state");
            return response.data;
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["memories"] }),
    });

    const duplicateMutation = useMutation({
        mutationFn: async () => {
            const response = await elysiaClient.memory["find-duplicates"].post();
            if (response.error) throw new Error("Failed to find duplicates");
            return response.data as { duplicates: Array<{ memoryId: number; duplicateId: number; similarity: number }> };
        },
        onSuccess: (data) => setDuplicateRows(data.duplicates),
    });

    const compressMutation = useMutation({
        mutationFn: async () => {
            const response = await elysiaClient.memory.compress.post({
                memoryIds: selectedMemoryIds,
            });
            if (response.error) throw new Error("Failed to compress memories");
            return response.data;
        },
        onSuccess: () => {
            setSelectedMemoryIds([]);
            queryClient.invalidateQueries({ queryKey: ["memories"] });
        },
    });

    const autoCompressMutation = useMutation({
        mutationFn: async () => {
            const response = await elysiaClient.memory.compress.auto.post();
            if (response.error) throw new Error("Failed to auto-compress memories");
            return response.data;
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["memories"] }),
    });

    const mergeMutation = useMutation({
        mutationFn: async (row: { memoryId: number; duplicateId: number }) => {
            const response = await elysiaClient.memory.merge.post({
                primaryId: String(row.memoryId),
                duplicateIds: [String(row.duplicateId)],
            });
            if (response.error) throw new Error("Failed to merge memories");
            return response.data;
        },
        onSuccess: () => {
            setDuplicateRows([]);
            queryClient.invalidateQueries({ queryKey: ["memories"] });
        },
    });

    const trimmedTraceRequestId = traceRequestId.trim();
    const traceRequestIdIsInvalid = Boolean(trimmedTraceRequestId) && !/^\d+$/.test(trimmedTraceRequestId);

    const traceMutation = useMutation({
        mutationFn: async () => {
            if (!trimmedTraceRequestId || traceRequestIdIsInvalid) {
                throw new Error("Enter a numeric request log ID.");
            }

            const response = await elysiaClient.memory.requests({ requestId: trimmedTraceRequestId }).get();
            if (response.error) throw new Error("Failed to load request trace");
            return response.data as RequestTrace;
        },
        onSuccess: setRequestTrace,
    });

    const apiKeys = apiKeysQuery.data?.apiKeys ?? [];
    const memories = memoriesQuery.data?.memories ?? [];
    const filteredMemories = useMemo(() => {
        const needle = search.trim().toLowerCase();
        if (!needle) return memories;
        return memories.filter((memory) => {
            return [
                memory.content,
                memory.source ?? "",
                memory.scope,
            ].some((value) => value.toLowerCase().includes(needle));
        });
    }, [memories, search]);

    const beginEdit = (memory: MemoryRow) => {
        setEditingId(memory.id);
        setEditContent(memory.content);
        setEditImportance(String(memory.importance));
        setEditArchived(memory.archived);
    };

    const toggleSelected = (id: string) => {
        setSelectedMemoryIds((current) =>
            current.includes(id)
                ? current.filter((item) => item !== id)
                : [...current, id]
        );
    };

    useEffect(() => {
        if (memoryView === "api_key" && !selectedApiKeyId && apiKeys[0]) {
            setSelectedApiKeyId(apiKeys[0].id);
        }
    }, [apiKeys, memoryView, selectedApiKeyId]);

    const currentApiKeyLabel =
        memoryView === "user"
            ? "User memories"
            : apiKeys.find((key) => key.id === selectedApiKeyId)?.name ?? "Selected API key";

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Memory</h1>
                        <p className="text-sm text-muted-foreground">
                            Inspect the memories the backend has saved for the logged-in user.
                        </p>
                    </div>
                    <Button
                        variant="outline"
                        className="self-start sm:self-auto"
                        onClick={() => queryClient.invalidateQueries({ queryKey: ["memories"] })}
                    >
                        <RefreshCw className="size-4" />
                        Refresh
                    </Button>
                </div>

                <Card className="bg-card/30 border-border/50">
                    <CardHeader>
                        <CardTitle className="text-lg">Filters</CardTitle>
                        <CardDescription>
                            View shared user memories or isolate the ones attached to a specific API key.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4 md:grid-cols-[240px_240px_minmax(0,1fr)]">
                        <div className="space-y-2">
                            <Label>Memory view</Label>
                            <Select value={memoryView} onValueChange={(value) => setMemoryView(value as MemoryView)}>
                                <SelectTrigger className="bg-black/20">
                                    <SelectValue placeholder="Memory view" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="user">User memories</SelectItem>
                                    <SelectItem value="api_key">API-key memories</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>API key</Label>
                            <Select
                                value={selectedApiKeyId}
                                onValueChange={setSelectedApiKeyId}
                                disabled={memoryView !== "api_key"}
                            >
                                <SelectTrigger className="bg-black/20">
                                    <SelectValue placeholder={memoryView === "api_key" ? "Select an API key" : "Not needed"} />
                                </SelectTrigger>
                                <SelectContent>
                                    {apiKeys.map((key) => (
                                        <SelectItem key={key.id} value={key.id}>
                                            {key.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="memory-search">Search</Label>
                            <div className="relative">
                                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    id="memory-search"
                                    value={search}
                                    onChange={(event) => setSearch(event.target.value)}
                                    placeholder="Search content, source, or scope"
                                    className="pl-10 bg-black/20"
                                />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-card/30 border-border/50">
                    <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="text-sm text-muted-foreground">
                            <span className="text-foreground">{selectedMemoryIds.length}</span> selected for compression.
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Button
                                variant="outline"
                                onClick={() => duplicateMutation.mutate()}
                                disabled={duplicateMutation.isPending}
                            >
                                <GitMerge className="size-4" />
                                Find duplicates
                            </Button>
                            <Button
                                variant="outline"
                                onClick={() => compressMutation.mutate()}
                                disabled={selectedMemoryIds.length < 2 || compressMutation.isPending}
                            >
                                <Zap className="size-4" />
                                Compress selected
                            </Button>
                            <Button
                                variant="outline"
                                onClick={() => autoCompressMutation.mutate()}
                                disabled={autoCompressMutation.isPending}
                            >
                                <Zap className="size-4" />
                                Auto-compress
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {duplicateRows.length > 0 && (
                    <Card className="bg-card/30 border-border/50">
                        <CardHeader>
                            <CardTitle className="text-lg">Duplicate candidates</CardTitle>
                            <CardDescription>Pairs above the duplicate similarity threshold.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            {duplicateRows.map((row) => (
                                <div key={`${row.memoryId}-${row.duplicateId}`} className="flex flex-col gap-2 rounded-md border border-border/50 bg-black/20 p-3 sm:flex-row sm:items-center sm:justify-between">
                                    <span className="text-sm text-muted-foreground">
                                        #{row.memoryId} and #{row.duplicateId} · {(row.similarity * 100).toFixed(1)}% similar
                                    </span>
                                    <Button size="sm" variant="outline" onClick={() => mergeMutation.mutate(row)}>
                                        <GitMerge className="size-3.5" />
                                        Merge
                                    </Button>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                )}

                <Card className="bg-card/30 border-border/50">
                    <CardHeader>
                        <CardTitle className="text-lg">Request memory trace</CardTitle>
                        <CardDescription>
                            Inspect which memories influenced a request by entering its numeric request log ID.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <div className="flex flex-col gap-2 sm:flex-row">
                                <Input
                                    value={traceRequestId}
                                    onChange={(event) => setTraceRequestId(event.target.value)}
                                    placeholder="Example: 124"
                                    inputMode="numeric"
                                    className="bg-black/20"
                                />
                                <Button
                                    variant="outline"
                                    onClick={() => traceMutation.mutate()}
                                    disabled={!trimmedTraceRequestId || traceRequestIdIsInvalid || traceMutation.isPending}
                                >
                                    <Search className="size-4" />
                                    Inspect
                                </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Use a request log ID from Analytics. This field does not search memory text.
                            </p>
                        </div>

                        {traceRequestIdIsInvalid && (
                            <div className="rounded-md border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
                                Enter a numeric request log ID, not a keyword.
                            </div>
                        )}

                        {traceMutation.isError && !traceRequestIdIsInvalid && (
                            <div className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                                {traceMutation.error?.message || "Failed to load request trace."}
                            </div>
                        )}

                        {requestTrace && (
                            <div className="space-y-4 rounded-lg border border-border/50 bg-black/20 p-4">
                                <div className="grid gap-3 text-sm md:grid-cols-4">
                                    <div>
                                        <p className="text-xs text-muted-foreground">Request</p>
                                        <p className="font-medium">#{requestTrace.request.id}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-muted-foreground">Model</p>
                                        <p className="font-medium">{requestTrace.request.model}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-muted-foreground">Provider</p>
                                        <p className="font-medium">{requestTrace.request.provider ?? "unknown"}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-muted-foreground">Injected</p>
                                        <p className="font-medium">{requestTrace.injection.injected} / {requestTrace.injection.considered}</p>
                                    </div>
                                </div>

                                <div className="grid gap-3 text-sm md:grid-cols-4">
                                    <div className="rounded-md border border-border/50 bg-background/30 p-3">
                                        <p className="text-xs text-muted-foreground">Input tokens</p>
                                        <p className="font-medium">{requestTrace.cost.inputTokens.toLocaleString()}</p>
                                    </div>
                                    <div className="rounded-md border border-border/50 bg-background/30 p-3">
                                        <p className="text-xs text-muted-foreground">Cached input</p>
                                        <p className="font-medium">{requestTrace.cost.cachedInputTokens.toLocaleString()}</p>
                                    </div>
                                    <div className="rounded-md border border-border/50 bg-background/30 p-3">
                                        <p className="text-xs text-muted-foreground">Cache savings</p>
                                        <p className="font-medium">{requestTrace.cost.cachingSavings.toLocaleString()}</p>
                                    </div>
                                    <div className="rounded-md border border-border/50 bg-background/30 p-3">
                                        <p className="text-xs text-muted-foreground">Total cost</p>
                                        <p className="font-medium">{requestTrace.cost.totalRequestCost.toLocaleString()}</p>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <p className="text-sm font-medium">Injected memories</p>
                                    {requestTrace.injectedMemories.length === 0 ? (
                                        <p className="text-sm text-muted-foreground">No memories were injected.</p>
                                    ) : requestTrace.injectedMemories.map((memory) => (
                                        <div key={memory.memoryId} className="rounded-md border border-border/50 bg-background/30 p-3">
                                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                                <span>#{memory.memoryId}</span>
                                                <span>score: {typeof memory.relevanceScore === "number" ? memory.relevanceScore.toFixed(3) : "n/a"}</span>
                                                <span>tokens: {memory.estimatedTokens ?? "n/a"}</span>
                                                {memory.isCompressed && <span>compressed</span>}
                                            </div>
                                            {memory.content && (
                                                <p className="mt-2 text-sm leading-6">{memory.content}</p>
                                            )}
                                            {memory.factors && (
                                                <pre className="mt-2 overflow-x-auto rounded bg-black/30 p-2 text-[11px] text-muted-foreground">
{JSON.stringify(memory.factors, null, 2)}
                                                </pre>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {memoriesQuery.isLoading || apiKeysQuery.isLoading ? (
                    <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground">
                        <Loader2 className="mr-2 size-4 animate-spin" />
                        Loading memories...
                    </div>
                ) : memoriesQuery.isError || apiKeysQuery.isError ? (
                    <div className="flex items-start gap-2.5 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                        <AlertCircle className="mt-0.5 size-4 shrink-0" />
                        <div>
                            <p>Failed to load memories.</p>
                            <p className="text-xs opacity-80">Make sure you are signed in and the backend is running.</p>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between text-sm text-muted-foreground">
                            <span>
                                Showing <span className="text-foreground">{filteredMemories.length}</span> memories for{" "}
                                <span className="text-foreground">{currentApiKeyLabel}</span>
                            </span>
                        </div>

                        {filteredMemories.length === 0 ? (
                            <Card className="bg-card/30 border-border/50">
                                <CardContent className="flex min-h-56 items-center justify-center py-10 text-center">
                                    <div className="max-w-sm">
                                        <p className="text-base font-medium">No memories yet</p>
                                        <p className="mt-2 text-sm text-muted-foreground">
                                            Try saving a prompt from the playground, or let the chat endpoint auto-save a user fact.
                                        </p>
                                    </div>
                                </CardContent>
                            </Card>
                        ) : (
                            <div className="grid gap-4">
                                {filteredMemories.map((memory) => (
                                    <Card key={memory.id} className="bg-card/30 border-border/50">
                                        <CardContent className="space-y-4 p-5">
                                            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                                <div className="min-w-0 space-y-2">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleSelected(memory.id)}
                                                            className={`size-4 rounded border ${selectedMemoryIds.includes(memory.id) ? "border-primary bg-primary" : "border-border bg-black/20"}`}
                                                            aria-label="Select memory"
                                                        />
                                                        <span className={`rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] ${scopeTone(memory.scope)}`}>
                                                            {memory.scope}
                                                        </span>
                                                        <span className="rounded-full border border-border/50 bg-black/20 px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                                                            {memory.enabled ? "enabled" : "disabled"}
                                                        </span>
                                                        <span className="rounded-full border border-border/50 bg-black/20 px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                                                            {memory.archived ? "archived" : "active"}
                                                        </span>
                                                        {memory.isCompressed && (
                                                            <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-amber-300">
                                                                compressed
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="max-w-3xl text-sm leading-6 text-foreground">
                                                        {memory.content}
                                                    </p>
                                                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                                        <span>source: {memory.source ?? "manual"}</span>
                                                        <span>saved by: {memory.savedBy}</span>
                                                        <span>confidence: {memory.confidence.toFixed(2)}</span>
                                                        <span>importance: {memory.importance.toFixed(2)}</span>
                                                        <span>last used: {formatDate(memory.lastUsedAt)}</span>
                                                        <span>created: {formatDate(memory.createdAt)}</span>
                                                        <span>api key: {memory.apiKeyId ?? "shared"}</span>
                                                    </div>
                                                </div>

                                                <div className="flex flex-wrap gap-2">
                                                    <Button variant="outline" size="sm" onClick={() => beginEdit(memory)}>
                                                        <Save className="size-3.5" />
                                                        Edit
                                                    </Button>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => archiveMutation.mutate({ id: memory.id, archived: memory.archived })}
                                                        disabled={archiveMutation.isPending}
                                                    >
                                                        {memory.archived ? <Undo2 className="size-3.5" /> : <Archive className="size-3.5" />}
                                                        {memory.archived ? "Restore" : "Archive"}
                                                    </Button>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => deleteMutation.mutate(memory.id)}
                                                        disabled={deleteMutation.isPending}
                                                    >
                                                        <Trash2 className="size-3.5" />
                                                        Delete
                                                    </Button>
                                                </div>
                                            </div>

                                            {editingId === memory.id && (
                                                <div className="grid gap-3 rounded-xl border border-border/50 bg-black/20 p-4">
                                                    <div className="space-y-2">
                                                        <Label htmlFor={`memory-content-${memory.id}`}>Content</Label>
                                                        <Input
                                                            id={`memory-content-${memory.id}`}
                                                            value={editContent}
                                                            onChange={(event) => setEditContent(event.target.value)}
                                                            className="bg-black/20"
                                                        />
                                                    </div>
                                                    <div className="grid gap-3 sm:grid-cols-2">
                                                        <div className="space-y-2">
                                                            <Label htmlFor={`memory-importance-${memory.id}`}>Importance</Label>
                                                            <Input
                                                                id={`memory-importance-${memory.id}`}
                                                                type="number"
                                                                min={1}
                                                                max={5}
                                                                value={editImportance}
                                                                onChange={(event) => setEditImportance(event.target.value)}
                                                                className="bg-black/20"
                                                            />
                                                        </div>
                                                        <div className="space-y-2">
                                                            <Label>State</Label>
                                                            <Select
                                                                value={editArchived ? "archived" : "active"}
                                                                onValueChange={(value) => setEditArchived(value === "archived")}
                                                            >
                                                                <SelectTrigger className="bg-black/20">
                                                                    <SelectValue />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="active">Active</SelectItem>
                                                                    <SelectItem value="archived">Archived</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-wrap gap-2">
                                                        <Button
                                                            size="sm"
                                                            onClick={() =>
                                                                updateMutation.mutate({
                                                                    id: memory.id,
                                                                    content: editContent.trim(),
                                                                    importance: Number(editImportance) || 1,
                                                                    archived: editArchived,
                                                                })
                                                            }
                                                            disabled={updateMutation.isPending || !editContent.trim()}
                                                        >
                                                            {updateMutation.isPending ? (
                                                                <>
                                                                    <Loader2 className="size-3.5 animate-spin" />
                                                                    Saving
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <Save className="size-3.5" />
                                                                    Save changes
                                                                </>
                                                            )}
                                                        </Button>
                                                        <Button variant="outline" size="sm" onClick={() => setEditingId(null)}>
                                                            Cancel
                                                        </Button>
                                                    </div>
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </DashboardLayout>
    );
}
