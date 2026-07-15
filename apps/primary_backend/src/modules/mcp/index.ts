import jwt from "@elysiajs/jwt";
import Elysia, { t } from "elysia";
import { McpModel } from "./models";
import { McpService } from "./service";

export const app = new Elysia({ prefix: "mcp" })
    .use(
        jwt({
            name: "jwt",
            secret: process.env.JWT_SECRET!,
        })
    )
    .resolve(async ({ cookie: { auth }, status, jwt }) => {
        if (!auth) {
            return status(401);
        }

        const decoded = await jwt.verify(auth.value as string);

        if (!decoded || !decoded.userId) {
            return status(401);
        }

        return {
            userId: decoded.userId as string,
        };
    })
    .get(
        "/",
        async ({ userId }) => McpService.list(Number(userId)),
        {
            response: {
                200: McpModel.listResponseSchema,
            },
        }
    )
    .post(
        "/servers",
        async ({ userId, body }) => McpService.createServer(Number(userId), body),
        {
            body: McpModel.createServerSchema,
            response: {
                200: McpModel.serverResponseSchema,
            },
        }
    )
    .put(
        "/servers/:serverId",
        async ({ userId, params: { serverId }, body, status }) => {
            try {
                return await McpService.updateServer(Number(userId), Number(serverId), body);
            } catch {
                return status(404, { message: "MCP server not found" });
            }
        },
        {
            body: McpModel.updateServerSchema,
            response: {
                200: McpModel.serverResponseSchema,
                404: t.Object({ message: t.String() }),
            },
        }
    )
    .delete(
        "/servers/:serverId",
        async ({ userId, params: { serverId }, status }) => {
            try {
                await McpService.deleteServer(Number(userId), Number(serverId));
                return { message: "MCP server deleted successfully" };
            } catch {
                return status(404, { message: "MCP server not found" });
            }
        },
        {
            response: {
                200: t.Object({ message: t.String() }),
                404: t.Object({ message: t.String() }),
            },
        }
    )
    .post(
        "/servers/:serverId/discover",
        async ({ userId, params: { serverId }, status }) => {
            try {
                return await McpService.discoverTools(Number(userId), Number(serverId));
            } catch (error) {
                return status(400, {
                    message: error instanceof Error ? error.message : "Failed to discover MCP tools",
                });
            }
        },
        {
            response: {
                200: McpModel.serverResponseSchema,
                400: McpModel.errorResponseSchema,
            },
        }
    )
    .get(
        "/api-keys/:apiKeyId/tools",
        async ({ userId, params: { apiKeyId }, status }) => {
            try {
                const tools = await McpService.listApiKeyTools(Number(userId), Number(apiKeyId));
                return { tools };
            } catch {
                return status(404, { message: "API key not found" });
            }
        },
        {
            response: {
                200: McpModel.apiKeyToolsResponseSchema,
                404: t.Object({ message: t.String() }),
            },
        }
    )
    .put(
        "/api-keys/:apiKeyId/tools/:toolId",
        async ({ userId, params: { apiKeyId, toolId }, body, status }) => {
            try {
                return await McpService.setApiKeyTool(
                    Number(userId),
                    Number(apiKeyId),
                    Number(toolId),
                    body.enabled
                );
            } catch {
                return status(404, { message: "Tool or API key not found" });
            }
        },
        {
            body: McpModel.setApiKeyToolSchema,
            response: {
                200: McpModel.setApiKeyToolResponseSchema,
                404: t.Object({ message: t.String() }),
            },
        }
    )
    .post(
        "/tools/:toolId/call",
        async ({ userId, params: { toolId }, body, status }) => {
            try {
                return await McpService.callTool(
                    Number(userId),
                    Number(toolId),
                    body.input ?? {},
                    body.apiKeyId ? Number(body.apiKeyId) : undefined
                );
            } catch (error) {
                const maybeExecution = error && typeof error === "object" && "execution" in error
                    ? (error as { execution?: unknown }).execution
                    : undefined;

                return status(400, {
                    message: error instanceof Error ? error.message : "Failed to call MCP tool",
                    ...(maybeExecution ? { execution: maybeExecution } : {}),
                });
            }
        },
        {
            body: McpModel.callToolSchema,
            response: {
                200: McpModel.callToolResponseSchema,
                400: McpModel.errorResponseSchema,
            },
        }
    );
