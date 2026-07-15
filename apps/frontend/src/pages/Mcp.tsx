import { Component, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    AlertCircle,
    CheckCircle2,
    Loader2,
    Play,
    Plug,
    RefreshCw,
    Server,
    ShieldCheck,
    Terminal,
    Wrench,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { primaryBackendUrl } from "@/config/api";

type McpTool = {
    id: string;
    serverId: string;
    name: string;
    description: string | null;
    inputSchema: unknown;
    enabled: boolean;
    allowed?: boolean;
    serverName?: string;
};

type McpServer = {
    id: string;
    name: string;
    command: string;
    args: string[];
    env: Record<string, string>;
    enabled: boolean;
    lastDiscoveredAt: string | null;
    tools: McpTool[];
};

type McpExecution = {
    id: string;
    apiKeyId: string | null;
    toolName: string;
    status: "success" | "error";
    input: unknown;
    output: unknown;
    error: string | null;
    latencyMs: number;
    createdAt: string;
};

type ApiKeyRow = {
    id: string;
    name: string;
    disabled: boolean;
};

function asArray<T>(value: unknown): T[] {
    return Array.isArray(value) ? value as T[] : [];
}

function normalizeTool(raw: unknown): McpTool | null {
    if (!raw || typeof raw !== "object") return null;
    const value = raw as Partial<McpTool>;
    if (value.id == null || value.name == null) return null;

    return {
        id: String(value.id),
        serverId: String(value.serverId ?? ""),
        name: String(value.name),
        description: typeof value.description === "string" ? value.description : null,
        inputSchema: value.inputSchema ?? null,
        enabled: Boolean(value.enabled),
        allowed: Boolean(value.allowed),
        serverName: typeof value.serverName === "string" ? value.serverName : undefined,
    };
}

function normalizeServer(raw: unknown): McpServer | null {
    if (!raw || typeof raw !== "object") return null;
    const value = raw as Partial<McpServer>;
    if (value.id == null || value.name == null) return null;

    return {
        id: String(value.id),
        name: String(value.name),
        command: String(value.command ?? ""),
        args: asArray<string>(value.args),
        env: value.env && typeof value.env === "object" && !Array.isArray(value.env)
            ? value.env as Record<string, string>
            : {},
        enabled: Boolean(value.enabled),
        lastDiscoveredAt: typeof value.lastDiscoveredAt === "string" ? value.lastDiscoveredAt : null,
        tools: asArray<unknown>(value.tools).map(normalizeTool).filter((tool): tool is McpTool => Boolean(tool)),
    };
}

function normalizeExecution(raw: unknown): McpExecution | null {
    if (!raw || typeof raw !== "object") return null;
    const value = raw as Partial<McpExecution>;
    if (value.id == null || value.toolName == null) return null;

    return {
        id: String(value.id),
        apiKeyId: value.apiKeyId == null ? null : String(value.apiKeyId),
        toolName: String(value.toolName),
        status: value.status === "error" ? "error" : "success",
        input: value.input ?? null,
        output: value.output ?? null,
        error: typeof value.error === "string" ? value.error : null,
        latencyMs: Number(value.latencyMs ?? 0),
        createdAt: typeof value.createdAt === "string" ? value.createdAt : new Date().toISOString(),
    };
}

function normalizeApiKey(raw: unknown): ApiKeyRow | null {
    if (!raw || typeof raw !== "object") return null;
    const value = raw as Partial<ApiKeyRow>;
    if (value.id == null || value.name == null) return null;

    return {
        id: String(value.id),
        name: String(value.name),
        disabled: Boolean(value.disabled),
    };
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(new URL(path, primaryBackendUrl), {
        ...init,
        credentials: "include",
        headers: {
            "content-type": "application/json",
            ...init?.headers,
        },
    });

    if (!response.ok) {
        const value = await response.json().catch(() => null) as { message?: string } | null;
        throw new Error(value?.message || `Request failed with status ${response.status}`);
    }

    return response.json() as Promise<T>;
}

function parseArgs(raw: string) {
    return raw
        .split(/\s+/)
        .map((item) => item.trim())
        .filter(Boolean);
}

function parseEnv(raw: string) {
    if (!raw.trim()) return {};
    return JSON.parse(raw) as Record<string, string>;
}

function pretty(value: unknown) {
    if (value == null) return "";
    return JSON.stringify(value, null, 2);
}

export function Mcp() {
    const queryClient = useQueryClient();
    const [name, setName] = useState("");
    const [command, setCommand] = useState("");
    const [args, setArgs] = useState("");
    const [env, setEnv] = useState("");
    const [selectedApiKeyId, setSelectedApiKeyId] = useState("");
    const [selectedToolId, setSelectedToolId] = useState("");
    const [toolInput, setToolInput] = useState("{}");
    const [formError, setFormError] = useState<string | null>(null);
    const [callResult, setCallResult] = useState<unknown>(null);

    const mcpQuery = useQuery({
        queryKey: ["mcp"],
        queryFn: async () => {
            const data = await apiRequest<{ servers?: unknown; executions?: unknown }>("/mcp");
            return {
                servers: asArray<unknown>(data.servers).map(normalizeServer).filter((server): server is McpServer => Boolean(server)),
                executions: asArray<unknown>(data.executions).map(normalizeExecution).filter((execution): execution is McpExecution => Boolean(execution)),
            };
        },
    });

    const apiKeysQuery = useQuery({
        queryKey: ["api-keys"],
        queryFn: async () => {
            const data = await apiRequest<{ apiKeys?: unknown }>("/api-keys");
            return asArray<unknown>(data.apiKeys).map(normalizeApiKey).filter((key): key is ApiKeyRow => Boolean(key));
        },
    });

    const apiKeyToolsQuery = useQuery({
        queryKey: ["mcp-api-key-tools", selectedApiKeyId],
        enabled: Boolean(selectedApiKeyId),
        queryFn: async () => {
            const data = await apiRequest<{ tools?: unknown }>(`/mcp/api-keys/${selectedApiKeyId}/tools`);
            return asArray<unknown>(data.tools).map(normalizeTool).filter((tool): tool is McpTool => Boolean(tool));
        },
    });

    const createServerMutation = useMutation({
        mutationFn: async () => {
            setFormError(null);
            return apiRequest<McpServer>("/mcp/servers", {
                method: "POST",
                body: JSON.stringify({
                    name,
                    command,
                    args: parseArgs(args),
                    env: parseEnv(env),
                }),
            });
        },
        onSuccess: () => {
            setName("");
            setCommand("");
            setArgs("");
            setEnv("");
            queryClient.invalidateQueries({ queryKey: ["mcp"] });
        },
        onError: (error) => {
            setFormError(error instanceof SyntaxError ? "Environment must be valid JSON." : error.message);
        },
    });

    const discoverMutation = useMutation({
        mutationFn: async (serverId: string) => {
            return apiRequest<McpServer>(`/mcp/servers/${serverId}/discover`, {
                method: "POST",
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["mcp"] });
            queryClient.invalidateQueries({ queryKey: ["mcp-api-key-tools"] });
        },
    });

    const permissionMutation = useMutation({
        mutationFn: async ({ toolId, enabled }: { toolId: string; enabled: boolean }) => {
            return apiRequest(`/mcp/api-keys/${selectedApiKeyId}/tools/${toolId}`, {
                method: "PUT",
                body: JSON.stringify({ enabled }),
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["mcp-api-key-tools", selectedApiKeyId] });
            queryClient.invalidateQueries({ queryKey: ["mcp"] });
        },
    });

    const callToolMutation = useMutation({
        mutationFn: async () => {
            setCallResult(null);
            const parsedInput = toolInput.trim() ? JSON.parse(toolInput) : {};
            return apiRequest<{ output: unknown }>(`/mcp/tools/${selectedToolId}/call`, {
                method: "POST",
                body: JSON.stringify({
                    apiKeyId: selectedApiKeyId || undefined,
                    input: parsedInput,
                }),
            });
        },
        onSuccess: (data) => {
            setCallResult(data.output);
            queryClient.invalidateQueries({ queryKey: ["mcp"] });
        },
    });

    const servers = mcpQuery.data?.servers ?? [];
    const executions = mcpQuery.data?.executions ?? [];
    const apiKeys = apiKeysQuery.data ?? [];
    const visibleTools = apiKeyToolsQuery.data ?? [];
    const selectedTool = useMemo(
        () => visibleTools.find((tool) => tool.id === selectedToolId),
        [selectedToolId, visibleTools]
    );

    const canCreate = name.trim() && command.trim() && !createServerMutation.isPending;

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">MCP</h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Register MCP servers, discover tools, and control which API keys can use them.
                        </p>
                    </div>
                    <Button
                        variant="outline"
                        onClick={() => {
                            queryClient.invalidateQueries({ queryKey: ["mcp"] });
                            queryClient.invalidateQueries({ queryKey: ["mcp-api-key-tools"] });
                        }}
                    >
                        <RefreshCw className="size-4" />
                        Refresh
                    </Button>
                </div>

                <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                    <Card className="bg-card/30 border-border/50">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-lg">
                                <Server className="size-4" />
                                Register server
                            </CardTitle>
                            <CardDescription>
                                Add a local stdio MCP server command. Synapse runs it when discovering or testing tools.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid gap-2">
                                <Label htmlFor="mcp-name">Name</Label>
                                <Input id="mcp-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Local filesystem" />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="mcp-command">Command</Label>
                                <Input id="mcp-command" value={command} onChange={(event) => setCommand(event.target.value)} placeholder="npx" />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="mcp-args">Args</Label>
                                <Input id="mcp-args" value={args} onChange={(event) => setArgs(event.target.value)} placeholder="-y @modelcontextprotocol/server-filesystem /tmp" />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="mcp-env">Environment JSON</Label>
                                <Textarea id="mcp-env" value={env} onChange={(event) => setEnv(event.target.value)} placeholder={'{"GITHUB_TOKEN":"..."}'} />
                            </div>
                            <Button disabled={!canCreate} onClick={() => createServerMutation.mutate()}>
                                {createServerMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plug className="size-4" />}
                                Add server
                            </Button>

                            {formError && (
                                <div className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                                    {formError}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card className="bg-card/30 border-border/50">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-lg">
                                <Wrench className="size-4" />
                                Servers and tools
                            </CardTitle>
                            <CardDescription>
                                Discover tools after adding a server, then grant access from the API-key section below.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {mcpQuery.isError ? (
                                <div className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                                    <AlertCircle className="mt-0.5 size-4 shrink-0" />
                                    {mcpQuery.error.message}
                                </div>
                            ) : mcpQuery.isLoading ? (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Loader2 className="size-4 animate-spin" />
                                    Loading MCP servers...
                                </div>
                            ) : servers.length === 0 ? (
                                <div className="rounded-lg border border-dashed border-border/50 p-6 text-center text-sm text-muted-foreground">
                                    No MCP servers registered yet.
                                </div>
                            ) : (
                                servers.map((server) => (
                                    <div key={server.id} className="rounded-lg border border-border/50 bg-black/20 p-4">
                                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <p className="font-medium">{server.name}</p>
                                                    <span className="rounded-full border border-border/50 px-2 py-0.5 text-[11px] text-muted-foreground">
                                                        {server.tools.length} tool{server.tools.length === 1 ? "" : "s"}
                                                    </span>
                                                </div>
                                                <p className="mt-1 font-mono text-xs text-muted-foreground">
                                                    {server.command} {server.args.join(" ")}
                                                </p>
                                                <p className="mt-1 text-xs text-muted-foreground">
                                                    Last discovered: {server.lastDiscoveredAt ? new Date(server.lastDiscoveredAt).toLocaleString() : "never"}
                                                </p>
                                            </div>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                disabled={discoverMutation.isPending}
                                                onClick={() => discoverMutation.mutate(server.id)}
                                            >
                                                {discoverMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                                                Discover
                                            </Button>
                                        </div>
                                        {server.tools.length > 0 && (
                                            <div className="mt-4 grid gap-2">
                                                {server.tools.map((tool) => (
                                                    <div key={tool.id} className="rounded-md border border-border/40 bg-background/30 px-3 py-2">
                                                        <p className="text-sm font-medium">{tool.name}</p>
                                                        {tool.description && (
                                                            <p className="mt-1 text-xs leading-5 text-muted-foreground">{tool.description}</p>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}

                            {discoverMutation.isError && (
                                <div className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                                    <AlertCircle className="mt-0.5 size-4 shrink-0" />
                                    {discoverMutation.error.message}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                <Card className="bg-card/30 border-border/50">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-lg">
                            <ShieldCheck className="size-4" />
                            API-key tool access
                        </CardTitle>
                        <CardDescription>
                            Enable only the tools an application key is allowed to call.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="max-w-sm space-y-2">
                            <Label>API key</Label>
                            <Select
                                value={selectedApiKeyId}
                                onValueChange={(value) => {
                                    setSelectedApiKeyId(value);
                                    setSelectedToolId("");
                                }}
                            >
                                <SelectTrigger className="w-full bg-black/20">
                                    <SelectValue placeholder="Select an API key" />
                                </SelectTrigger>
                                <SelectContent>
                                    {apiKeys.map((key) => (
                                        <SelectItem key={key.id} value={key.id}>
                                            {key.name}{key.disabled ? " (disabled)" : ""}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {apiKeysQuery.isError ? (
                            <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
                                {apiKeysQuery.error.message}
                            </div>
                        ) : !selectedApiKeyId ? (
                            <div className="rounded-lg border border-dashed border-border/50 p-6 text-sm text-muted-foreground">
                                Select an API key to manage tool permissions.
                            </div>
                        ) : apiKeyToolsQuery.isLoading ? (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Loader2 className="size-4 animate-spin" />
                                Loading tool permissions...
                            </div>
                        ) : apiKeyToolsQuery.isError ? (
                            <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
                                {apiKeyToolsQuery.error.message}
                            </div>
                        ) : visibleTools.length === 0 ? (
                            <div className="rounded-lg border border-dashed border-border/50 p-6 text-sm text-muted-foreground">
                                Discover tools from a server before assigning them.
                            </div>
                        ) : (
                            <div className="grid gap-2 md:grid-cols-2">
                                {visibleTools.map((tool) => (
                                    <div key={tool.id} className="flex items-start justify-between gap-3 rounded-lg border border-border/50 bg-black/20 p-3">
                                        <div>
                                            <p className="text-sm font-medium">{tool.name}</p>
                                            <p className="mt-1 text-xs text-muted-foreground">{tool.serverName}</p>
                                            {tool.description && (
                                                <p className="mt-2 text-xs leading-5 text-muted-foreground">{tool.description}</p>
                                            )}
                                        </div>
                                        <Button
                                            size="sm"
                                            variant={tool.allowed ? "default" : "outline"}
                                            disabled={permissionMutation.isPending}
                                            onClick={() => permissionMutation.mutate({ toolId: tool.id, enabled: !tool.allowed })}
                                        >
                                            {tool.allowed ? "Enabled" : "Enable"}
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                <div className="grid gap-4 lg:grid-cols-[1fr_0.85fr]">
                    <Card className="bg-card/30 border-border/50">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-lg">
                                <Play className="size-4" />
                                Manual tool test
                            </CardTitle>
                            <CardDescription>
                                Call an enabled MCP tool through Synapse and log the execution trace.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid gap-3 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <Label>Tool</Label>
                                    <Select value={selectedToolId} onValueChange={setSelectedToolId} disabled={!selectedApiKeyId}>
                                        <SelectTrigger className="w-full bg-black/20">
                                            <SelectValue placeholder="Select a tool" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {visibleTools.filter((tool) => tool.allowed).map((tool) => (
                                                <SelectItem key={tool.id} value={tool.id}>
                                                    {tool.serverName} / {tool.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Input schema</Label>
                                    <pre className="min-h-9 overflow-x-auto rounded-md border border-border/50 bg-black/20 px-3 py-2 text-xs text-muted-foreground">
{selectedTool?.inputSchema ? pretty(selectedTool.inputSchema) : "Select a tool"}
                                    </pre>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="mcp-tool-input">Tool input JSON</Label>
                                <Textarea
                                    id="mcp-tool-input"
                                    value={toolInput}
                                    onChange={(event) => setToolInput(event.target.value)}
                                    className="min-h-32 font-mono text-xs"
                                />
                            </div>
                            <Button
                                disabled={!selectedApiKeyId || !selectedToolId || callToolMutation.isPending}
                                onClick={() => callToolMutation.mutate()}
                            >
                                {callToolMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Terminal className="size-4" />}
                                Call tool
                            </Button>

                            {callToolMutation.isError && (
                                <div className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                                    {callToolMutation.error instanceof SyntaxError ? "Tool input must be valid JSON." : callToolMutation.error.message}
                                </div>
                            )}

                            {callResult != null && (
                                <pre className="max-h-96 overflow-auto rounded-lg border border-border/50 bg-black/30 p-3 text-xs text-foreground">
{pretty(callResult)}
                                </pre>
                            )}
                        </CardContent>
                    </Card>

                    <Card className="bg-card/30 border-border/50">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-lg">
                                <CheckCircle2 className="size-4" />
                                Recent tool executions
                            </CardTitle>
                            <CardDescription>
                                Last 10 MCP tool calls routed through Synapse.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            {executions.length === 0 ? (
                                <div className="rounded-lg border border-dashed border-border/50 p-6 text-sm text-muted-foreground">
                                    No MCP tool executions yet.
                                </div>
                            ) : executions.map((execution) => (
                                <div key={execution.id} className="rounded-lg border border-border/50 bg-black/20 p-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <p className="text-sm font-medium">{execution.toolName}</p>
                                        <span className={execution.status === "success" ? "text-xs text-emerald-400" : "text-xs text-destructive"}>
                                            {execution.status}
                                        </span>
                                    </div>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        {execution.latencyMs} ms · {new Date(execution.createdAt).toLocaleString()}
                                    </p>
                                    {execution.error && (
                                        <p className="mt-2 text-xs text-destructive">{execution.error}</p>
                                    )}
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </DashboardLayout>
    );
}

class McpErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
    override state: { error: Error | null } = { error: null };

    static getDerivedStateFromError(error: Error) {
        return { error };
    }

    override render() {
        if (!this.state.error) return this.props.children;

        return (
            <DashboardLayout>
                <Card className="bg-card/30 border-destructive/30">
                    <CardHeader>
                        <CardTitle className="text-lg">MCP failed to load</CardTitle>
                        <CardDescription>
                            The page hit a frontend runtime error instead of rendering normally.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <pre className="overflow-auto rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
{this.state.error.message}
                        </pre>
                    </CardContent>
                </Card>
            </DashboardLayout>
        );
    }
}

export function McpRoute() {
    return (
        <McpErrorBoundary>
            <Mcp />
        </McpErrorBoundary>
    );
}
