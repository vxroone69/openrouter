import bearer from "@elysiajs/bearer";
import { cors } from "@elysiajs/cors";
import { prisma } from "db";
import { Elysia, t } from "elysia";
import { checkRateLimit } from "./rateLimit/slidingWindow";
import { tryProviderFallback, tryProviderFallbackStream } from "./routing/providerFallback";
import { createOpenAIChatCompletionStream } from "./streaming/openaiChatCompletionStream";
import { classifyRequestError, scheduleRequestLog } from "./logging/requestLog";
import { retrieveMemoryForUser } from "./memory/retrieveMemory";
import { injectMemoryIntoMessages } from "./memory/injectMemoryIntoMessages";
import { writeMemoryFromChatTurn } from "./memory/writeMemory";

function elapsedMs(startedAt: number) {
  return Math.max(0, Math.round(performance.now() - startedAt));
}

function totalTokens(inputTokensConsumed: number, outputTokensConsumed: number) {
  return inputTokensConsumed + outputTokensConsumed;
}

function costInMicrodollars(
  inputTokensConsumed: number,
  outputTokensConsumed: number,
  inputTokenCost: number,
  outputTokenCost: number
) {
  // The seed values are priced like "$ per 1M tokens".
  // That means the raw per-token cost is in microdollars, so we store microdollars here.
  const estimatedCost = inputTokensConsumed * inputTokenCost + outputTokensConsumed * outputTokenCost;
  return Math.max(0, Math.round(estimatedCost));
}

const app = new Elysia()
  .use(cors({
    origin: "http://localhost:3001",
    credentials: true,
  }))
  .use(bearer())
  .post("/api/v1/chat/completions", async ({ status, bearer: apiKey, body, query }) => {
    const requestStartedAt = performance.now();
    const model = body.model;
    const [, providerModelName] = model.split("/");
    const streamingRequested = Boolean(body.stream);

    const apiKeydb = await prisma.apiKey.findFirst({
      where: {
        apiKey,
        disabled: false,
        deleted: false
      },
      select: {
        id: true,
        user: true
      }
    });

    if (!apiKeydb) {
      return status(403, {
        message: "Invalid API Key"
      });
    }

    const logBase = {
      userId: apiKeydb.user.id,
      apiKeyId: apiKeydb.id,
      model,
      streaming: streamingRequested,
    };

    const persistUsage = async ({
      providerMappingId,
      output,
      inputTokensConsumed,
      outputTokensConsumed,
    }: {
      providerMappingId: number;
      output: string;
      inputTokensConsumed: number;
      outputTokensConsumed: number;
    }) => {
      const totalTokensConsumed = totalTokens(inputTokensConsumed, outputTokensConsumed);

      try {
        await prisma.$transaction(
          async (tx) => {
            await tx.apiKey.update({
              where: {
                id: apiKeydb.id
              },
              data: {
                creditsConsumed: {
                  increment: totalTokensConsumed
                },
                lastUsed: new Date()
              }
            });

            await tx.user.update({
              where: {
                id: apiKeydb.user.id
              },
              data: {
                credits: {
                  decrement: totalTokensConsumed
                }
              }
            });

            await tx.conversation.create({
              data: {
                conversationId: crypto.randomUUID(),
                input: JSON.stringify(body.messages),
                output,
                inputTokenCount: inputTokensConsumed,
                outputTokenCount: outputTokensConsumed,
                userId: apiKeydb.user.id,
                apiKeyId: apiKeydb.id,
                modelProviderMappingId: providerMappingId
              }
            });
          },
          {
            maxWait: 10_000,
            timeout: 15_000,
          }
        );
      } catch (error) {
        console.error("Failed to persist usage accounting:", error);
      }
    };

    const persistMemory = (assistantOutput: string) => {
      void writeMemoryFromChatTurn({
        userId: apiKeydb.user.id,
        apiKeyId: apiKeydb.id,
        messages: effectiveMessages,
        assistantOutput,
        model,
      }).catch((error) => {
        console.error("Failed to persist chat memory:", error);
      });
    };

    const logDeniedRequest = (details: {
      status: "error" | "rate_limited";
      errorType: "timeout" | "provider_5xx" | "invalid_request" | "rate_limit" | "other" | null;
      provider?: string | null;
      fallbackCount?: number;
    }) => {
      scheduleRequestLog({
        ...logBase,
        status: details.status,
        errorType: details.errorType,
        provider: details.provider ?? null,
        fallbackUsed: (details.fallbackCount ?? 0) > 1,
        fallbackCount: details.fallbackCount ?? 0,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        cost: 0,
        latencyMs: elapsedMs(requestStartedAt),
        ttftMs: null,
      });
    };

    const rateLimit = await checkRateLimit({
      key: `rate-limit:api-key:${apiKeydb.id}`,
      limit: Number(process.env.RATE_LIMIT_MAX_REQUESTS ?? 10),
      windowMs: Number(process.env.RATE_LIMIT_WINDOW_SECONDS ?? 60) * 1000,
    });

    if (!rateLimit.allowed) {
      logDeniedRequest({
        status: "rate_limited",
        errorType: "rate_limit",
      });

      return status(429, {
        message: "Rate limit exceeded",
        limit: rateLimit.limit,
        remaining: rateLimit.remaining,
        resetAt: rateLimit.resetAt,
      });
    }

    if (apiKeydb.user.credits <= 0) {
      logDeniedRequest({
        status: "error",
        errorType: "other",
      });

      return status(403, {
        message: "Insufficient Credits"
      });
    }

    const modeldb = await prisma.model.findFirst({
      where: {
        slug: model
      }
    });

    if (!modeldb) {
      logDeniedRequest({
        status: "error",
        errorType: "invalid_request",
      });

      return status(403, {
        message: "Unsupported Model"
      });
    }

    const providers = await prisma.modelProviderMapping.findMany({
      where: {
        modelId: modeldb.id
      },
      include: {
        provider: true
      },
      orderBy: {
        id: "asc"
      }
    });

    const providerMappingById = new Map(
      providers.map((provider) => [
        provider.id,
        provider,
      ])
    );

    if (providers.length === 0) {
      logDeniedRequest({
        status: "error",
        errorType: "invalid_request",
      });

      return status(403, {
        message: "No providers mapped for this model"
      });
    }

    const memoryMode = typeof query.memory === "string" ? query.memory : "user";
    const memories = await retrieveMemoryForUser(
      apiKeydb.user.id,
      apiKeydb.id,
      5,
      memoryMode
    );
    const effectiveMessages = injectMemoryIntoMessages(body.messages, memories);

    if (body.stream) {
      const providerResult = await tryProviderFallbackStream({
        providers,
        modelName: providerModelName,
        messages: effectiveMessages,
      });

      const selectedProviderMapping = providerMappingById.get(providerResult.ok ? providerResult.providerMappingId : -1);

      if (!providerResult.ok) {
        scheduleRequestLog({
          ...logBase,
          status: "error",
          errorType: classifyRequestError(
            providerResult.errors.map((error) => error.message).join(" | ")
          ),
          provider: providerResult.lastProviderName ?? null,
          fallbackUsed: providerResult.attemptedCount > 1,
          fallbackCount: providerResult.attemptedCount,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          cost: 0,
          streaming: true,
          latencyMs: elapsedMs(requestStartedAt),
          ttftMs: null,
        });

        return status(503, {
          message: "All providers failed",
          errors: providerResult.errors,
        });
      }

      let ttftMs: number | null = null;

      return createOpenAIChatCompletionStream({
        model,
        firstChunk: providerResult.firstChunk,
        iterator: providerResult.iterator,
        onFirstContentChunk: () => {
          if (ttftMs == null) {
            ttftMs = elapsedMs(requestStartedAt);
          }
        },
        onDone: (usage, output) => {
          void persistUsage({
            providerMappingId: providerResult.providerMappingId,
            output,
            inputTokensConsumed: usage.inputTokensConsumed,
            outputTokensConsumed: usage.outputTokensConsumed,
          });
          persistMemory(output);

          const responseCost = selectedProviderMapping
            ? costInMicrodollars(
                usage.inputTokensConsumed,
                usage.outputTokensConsumed,
                selectedProviderMapping.inputTokenCost,
                selectedProviderMapping.outputTokenCost
              )
            : totalTokens(usage.inputTokensConsumed, usage.outputTokensConsumed);

          scheduleRequestLog({
            ...logBase,
            status: "success",
            errorType: null,
            provider: providerResult.providerName,
            fallbackUsed: providerResult.attemptedCount > 1,
            fallbackCount: providerResult.attemptedCount,
            promptTokens: usage.inputTokensConsumed,
            completionTokens: usage.outputTokensConsumed,
            totalTokens: totalTokens(usage.inputTokensConsumed, usage.outputTokensConsumed),
            cost: responseCost,
            streaming: true,
            latencyMs: elapsedMs(requestStartedAt),
            ttftMs,
          });
        },
      });
    }

    const providerResult = await tryProviderFallback({
      providers,
      modelName: providerModelName,
      messages: effectiveMessages,
    });

    if (!providerResult.ok) {
      scheduleRequestLog({
        ...logBase,
        status: "error",
        errorType: classifyRequestError(
          providerResult.errors.map((error) => error.message).join(" | ")
        ),
        provider: providerResult.lastProviderName ?? null,
        fallbackUsed: providerResult.attemptedCount > 1,
        fallbackCount: providerResult.attemptedCount,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        cost: 0,
        streaming: false,
        latencyMs: elapsedMs(requestStartedAt),
        ttftMs: null,
      });

      return status(503, {
        message: "All providers failed",
        errors: providerResult.errors,
      });
    }

    const response = providerResult.response;
    const selectedProviderMapping = providerMappingById.get(providerResult.providerMappingId);
    const responseCost = selectedProviderMapping
      ? costInMicrodollars(
          response.inputTokensConsumed,
          response.outputTokensConsumed,
          selectedProviderMapping.inputTokenCost,
          selectedProviderMapping.outputTokenCost
        )
      : totalTokens(response.inputTokensConsumed, response.outputTokensConsumed);
    const output = response.completions.choices
      .map((choice) => choice.message.content)
      .join("\n");

    await persistUsage({
      providerMappingId: providerResult.providerMappingId,
      output,
      inputTokensConsumed: response.inputTokensConsumed,
      outputTokensConsumed: response.outputTokensConsumed,
    });
    persistMemory(output);

    scheduleRequestLog({
      ...logBase,
      status: "success",
      errorType: null,
      provider: providerResult.providerName,
      fallbackUsed: providerResult.attemptedCount > 1,
      fallbackCount: providerResult.attemptedCount,
      promptTokens: response.inputTokensConsumed,
      completionTokens: response.outputTokensConsumed,
      totalTokens: totalTokens(response.inputTokensConsumed, response.outputTokensConsumed),
      cost: responseCost,
      streaming: false,
      latencyMs: elapsedMs(requestStartedAt),
      ttftMs: null,
    });

    return response;
  }, {
    body: t.Object({
      model: t.String(),
      stream: t.Optional(t.Boolean()),
      messages: t.Array(t.Object({
        role: t.Enum({
          user: "user",
          assistant: "assistant"
        }),
        content: t.String()
        }))
    }),
    query: t.Object({
      memory: t.Optional(t.Union([
        t.Literal("user"),
        t.Literal("api_key"),
      ])),
    })
  })
  .listen(3002);

console.log(`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`);
