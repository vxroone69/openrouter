import { prisma } from "db";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { Messages } from "../types";
import type { LLMResponse } from "../llms/Base";
import type { tryProviderFallback } from "../routing/providerFallback";

type ProviderRunner = typeof tryProviderFallback;
type ProviderRunnerSuccess = Awaited<ReturnType<ProviderRunner>> & { ok: true };

type EnabledTool = {
  id: number;
  exposedName: string;
  name: string;
  description: string | null;
  inputSchema: unknown;
  serverId: number;
  serverName: string;
  command: string;
  args: string[];
  env: Record<string, string>;
};

type ToolCall = {
  tool: string;
  arguments: Record<string, unknown>;
};

type ToolExecutionTrace = {
  toolId: number;
  toolName: string;
  exposedName: string;
  input: unknown;
  output?: unknown;
  error?: string;
  latencyMs: number;
};

type ToolLoopResult =
  | {
      usedTools: false;
    }
  | {
      usedTools: true;
      providerResult: ProviderRunnerSuccess;
      response: LLMResponse;
      traces: ToolExecutionTrace[];
      inputTokensConsumed: number;
      outputTokensConsumed: number;
      providerToolPromptTokens: number;
    };

function safeToolName(id: number, name: string) {
  return `mcp_${id}_${name.replace(/[^a-zA-Z0-9_]/g, "_")}`;
}

function parseJsonArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function parseJsonEnv(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const env: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === "string") env[key] = raw;
  }
  return env;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function isFilesystemMcpServer(command: string, args: string[]) {
  return command === "npx" && args.includes("@modelcontextprotocol/server-filesystem");
}

function filesystemAllowedDirectories(args: string[]) {
  const packageIndex = args.findIndex((arg) => arg === "@modelcontextprotocol/server-filesystem");
  if (packageIndex === -1) return [];

  return args
    .slice(packageIndex + 1)
    .filter((arg) => !arg.startsWith("-"))
    .map((dir) => path.resolve(dir));
}

function resolveAllowedPath(rawPath: unknown, allowedDirectories: string[]) {
  if (typeof rawPath !== "string" || rawPath.length === 0) {
    throw new Error("A path string is required");
  }

  const resolved = path.resolve(rawPath);
  const isAllowed = allowedDirectories.some((allowed) => {
    const relative = path.relative(allowed, resolved);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  });

  if (!isAllowed) {
    throw new Error(`Path is outside allowed directories: ${resolved}`);
  }

  return resolved;
}

function textContent(text: string) {
  return {
    content: [
      {
        type: "text",
        text,
      },
    ],
  };
}

async function directoryTree(dir: string): Promise<{ name: string; type: "file" | "directory"; children?: unknown[] }> {
  const entryStat = await stat(dir);
  const name = path.basename(dir) || dir;

  if (!entryStat.isDirectory()) {
    return {
      name,
      type: "file",
    };
  }

  const entries = await readdir(dir, { withFileTypes: true });
  const children = await Promise.all(entries.map((entry) => directoryTree(path.join(dir, entry.name))));

  return {
    name,
    type: "directory",
    children,
  };
}

async function callFilesystemTool(tool: EnabledTool, input: unknown) {
  if (!isFilesystemMcpServer(tool.command, tool.args)) {
    throw new Error("Gateway MCP tool calling currently supports filesystem tools only");
  }

  const allowedDirectories = filesystemAllowedDirectories(tool.args);
  if (allowedDirectories.length === 0) {
    throw new Error("Filesystem MCP server has no allowed directories configured");
  }

  const body = asObject(input);

  if (tool.name === "list_allowed_directories") {
    return textContent(`Allowed directories:\n${allowedDirectories.join("\n")}`);
  }

  if (tool.name === "list_directory" || tool.name === "list_directory_with_sizes") {
    const dir = resolveAllowedPath(body.path, allowedDirectories);
    const entries = await readdir(dir, { withFileTypes: true });
    const lines = await Promise.all(entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      const prefix = entry.isDirectory() ? "[DIR]" : "[FILE]";
      if (tool.name !== "list_directory_with_sizes" || entry.isDirectory()) {
        return `${prefix} ${entry.name}`;
      }
      const fileStat = await stat(fullPath);
      return `${prefix} ${entry.name} (${fileStat.size} bytes)`;
    }));

    return textContent(lines.join("\n"));
  }

  if (tool.name === "get_file_info") {
    const target = resolveAllowedPath(body.path, allowedDirectories);
    const info = await stat(target);
    return textContent(JSON.stringify({
      path: target,
      size: info.size,
      type: info.isDirectory() ? "directory" : "file",
      created: info.birthtime.toISOString(),
      modified: info.mtime.toISOString(),
      accessed: info.atime.toISOString(),
      mode: info.mode,
    }, null, 2));
  }

  if (tool.name === "read_text_file" || tool.name === "read_file") {
    const target = resolveAllowedPath(body.path, allowedDirectories);
    const content = await readFile(target, "utf8");
    const head = typeof body.head === "number" ? body.head : null;
    const tail = typeof body.tail === "number" ? body.tail : null;
    const lines = content.split(/\r?\n/);

    if (head != null) return textContent(lines.slice(0, head).join("\n"));
    if (tail != null) return textContent(lines.slice(-tail).join("\n"));
    return textContent(content);
  }

  if (tool.name === "directory_tree") {
    const dir = resolveAllowedPath(body.path, allowedDirectories);
    return textContent(JSON.stringify(await directoryTree(dir), null, 2));
  }

  throw new Error(`Tool ${tool.name} is not supported by gateway MCP fallback`);
}

export async function getEnabledMcpToolsForApiKey(userId: number, apiKeyId: number): Promise<EnabledTool[]> {
  const tools = await prisma.mcpTool.findMany({
    where: {
      enabled: true,
      server: {
        userId,
        enabled: true,
      },
      apiKeyLinks: {
        some: {
          apiKeyId,
          enabled: true,
        },
      },
    },
    include: {
      server: true,
    },
    orderBy: [
      { serverId: "asc" },
      { name: "asc" },
    ],
  });

  return tools.map((tool) => ({
    id: tool.id,
    exposedName: safeToolName(tool.id, tool.name),
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    serverId: tool.serverId,
    serverName: tool.server.name,
    command: tool.server.command,
    args: parseJsonArray(tool.server.args),
    env: parseJsonEnv(tool.server.env),
  }));
}

function buildToolInstruction(tools: EnabledTool[]) {
  const toolLines = tools.map((tool) => {
    return [
      `- ${tool.exposedName}`,
      `  original_name: ${tool.name}`,
      `  server: ${tool.serverName}`,
      `  description: ${tool.description ?? "No description"}`,
      `  input_schema: ${JSON.stringify(tool.inputSchema ?? {})}`,
    ].join("\n");
  }).join("\n");

  return [
    "Synapse has enabled MCP tools for this API key.",
    "If a tool is needed to answer the user, respond with ONLY this JSON shape and no markdown:",
    "{\"tool_call\":{\"tool\":\"TOOL_NAME\",\"arguments\":{}}}",
    "If no tool is needed, answer normally.",
    "Available tools:",
    toolLines,
  ].join("\n\n");
}

function withToolInstruction(messages: Messages, tools: EnabledTool[]): Messages {
  const instruction = buildToolInstruction(tools);
  if (messages.length === 0) {
    return [{ role: "user", content: instruction }];
  }

  const [firstMessage, ...rest] = messages;
  return [
    {
      ...firstMessage,
      content: `${instruction}\n\nUser request:\n${firstMessage.content}`,
    },
    ...rest,
  ];
}

function parseToolCall(text: string): ToolCall | null {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;

  try {
    const parsed = JSON.parse(trimmed.slice(start, end + 1));
    const rawCall = asObject(parsed.tool_call);
    if (typeof rawCall.tool !== "string") return null;
    return {
      tool: rawCall.tool,
      arguments: asObject(rawCall.arguments),
    };
  } catch {
    return null;
  }
}

function outputText(response: LLMResponse) {
  return response.completions.choices
    .map((choice) => choice.message.content)
    .join("\n");
}

async function logToolExecution({
  userId,
  apiKeyId,
  tool,
  input,
  output,
  error,
  latencyMs,
}: {
  userId: number;
  apiKeyId: number;
  tool: EnabledTool;
  input: unknown;
  output?: unknown;
  error?: string;
  latencyMs: number;
}) {
  return prisma.mcpToolExecution.create({
    data: {
      userId,
      apiKeyId,
      serverId: tool.serverId,
      toolId: tool.id,
      toolName: tool.name,
      status: error ? "error" : "success",
      input: input as never,
      output: output as never,
      error,
      latencyMs,
    },
  });
}

export async function runMcpToolCallingLoop({
  userId,
  apiKeyId,
  tools,
  providers,
  modelName,
  messages,
  cacheableContext,
  runProvider,
}: {
  userId: number;
  apiKeyId: number;
  tools: EnabledTool[];
  providers: Parameters<ProviderRunner>[0]["providers"];
  modelName: string;
  messages: Messages;
  cacheableContext?: string | null;
  runProvider: ProviderRunner;
}): Promise<ToolLoopResult> {
  if (tools.length === 0) {
    return { usedTools: false };
  }

  const byName = new Map(tools.map((tool) => [tool.exposedName, tool]));
  const firstResult = await runProvider({
    providers,
    modelName,
    messages: withToolInstruction(messages, tools),
    cacheableContext,
  });

  if (!firstResult.ok) {
    return { usedTools: false };
  }

  const firstOutput = outputText(firstResult.response);
  const toolCall = parseToolCall(firstOutput);
  if (!toolCall) {
    return {
      usedTools: true,
      providerResult: firstResult,
      response: firstResult.response,
      traces: [],
      inputTokensConsumed: firstResult.response.inputTokensConsumed,
      outputTokensConsumed: firstResult.response.outputTokensConsumed,
      providerToolPromptTokens: 0,
    };
  }

  const tool = byName.get(toolCall.tool);
  if (!tool) {
    return { usedTools: false };
  }

  const startedAt = performance.now();
  const traces: ToolExecutionTrace[] = [];
  let toolOutput: unknown;

  try {
    toolOutput = await callFilesystemTool(tool, toolCall.arguments);
    const latencyMs = Math.max(0, Math.round(performance.now() - startedAt));
    await logToolExecution({
      userId,
      apiKeyId,
      tool,
      input: toolCall.arguments,
      output: toolOutput,
      latencyMs,
    });
    traces.push({
      toolId: tool.id,
      toolName: tool.name,
      exposedName: tool.exposedName,
      input: toolCall.arguments,
      output: toolOutput,
      latencyMs,
    });
  } catch (error) {
    const latencyMs = Math.max(0, Math.round(performance.now() - startedAt));
    const message = error instanceof Error ? error.message : "Failed to call MCP tool";
    await logToolExecution({
      userId,
      apiKeyId,
      tool,
      input: toolCall.arguments,
      error: message,
      latencyMs,
    });
    traces.push({
      toolId: tool.id,
      toolName: tool.name,
      exposedName: tool.exposedName,
      input: toolCall.arguments,
      error: message,
      latencyMs,
    });
    toolOutput = { error: message };
  }

  const finalMessages: Messages = [
    ...messages,
    {
      role: "assistant",
      content: firstOutput,
    },
    {
      role: "user",
      content: [
        `Synapse executed MCP tool ${tool.exposedName}.`,
        `Tool result JSON: ${JSON.stringify(toolOutput)}`,
        "Use this tool result to answer the original user request. Do not mention internal tool JSON unless useful.",
      ].join("\n\n"),
    },
  ];

  const finalResult = await runProvider({
    providers,
    modelName,
    messages: finalMessages,
    cacheableContext,
  });

  if (!finalResult.ok) {
    return {
      usedTools: true,
      providerResult: firstResult,
      response: firstResult.response,
      traces,
      inputTokensConsumed: firstResult.response.inputTokensConsumed,
      outputTokensConsumed: firstResult.response.outputTokensConsumed,
      providerToolPromptTokens: 0,
    };
  }

  return {
    usedTools: true,
    providerResult: finalResult,
    response: finalResult.response,
    traces,
    inputTokensConsumed: firstResult.response.inputTokensConsumed + finalResult.response.inputTokensConsumed,
    outputTokensConsumed: firstResult.response.outputTokensConsumed + finalResult.response.outputTokensConsumed,
    providerToolPromptTokens: firstResult.response.inputTokensConsumed,
  };
}
