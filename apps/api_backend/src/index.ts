import bearer from "@elysiajs/bearer";
import { cors } from "@elysiajs/cors";
import { prisma } from "db";
import { Elysia, t } from "elysia";
import { checkRateLimit } from "./rateLimit/slidingWindow";
import { tryProviderFallback, tryProviderFallbackStream } from "./routing/providerFallback";
import { createOpenAIChatCompletionStream } from "./streaming/openaiChatCompletionStream";
import { classifyRequestError, scheduleRequestLog } from "./logging/requestLog";
import { markMemoriesUsed, retrieveMemoryForUser } from "./memory/retrieveMemory";
import { writeMemoryFromChatTurn } from "./memory/writeMemory";
import { buildMemoryPrefix } from "./memory/buildMemoryPrefix";

function elapsedMs(startedAt: number) {
  return Math.max(0, Math.round(performance.now() - startedAt));
}

function totalTokens(inputTokensConsumed: number, outputTokensConsumed: number) {
  return inputTokensConsumed + outputTokensConsumed;
}

function providerCostNanoDollars(
  inputTokensConsumed: number,
  outputTokensConsumed: number,
  inputTokenCostNanoDollars: number,
  outputTokenCostNanoDollars: number
) {
  const estimatedCost =
    inputTokensConsumed * inputTokenCostNanoDollars +
    outputTokensConsumed * outputTokenCostNanoDollars;
  return Math.max(0, Math.round(estimatedCost));
}

function creditsFromNanoDollars(providerCostNanoDollars: number) {
  const nanoDollarsPerCredit = Number(process.env.NANO_DOLLARS_PER_CREDIT ?? 1000);
  const markupMultiplier = Number(process.env.CREDIT_MARKUP_MULTIPLIER ?? 1.25);

  return Math.max(
    1,
    Math.ceil((providerCostNanoDollars / nanoDollarsPerCredit) * markupMultiplier)
  );
}

function estimateTokens(text: string) {
  return Math.max(1, Math.ceil(text.length / 4));
}

function buildCostAccounting({
  inputTokens,
  outputTokens,
  cachedInputTokens,
  cacheCreationInputTokens,
  memoryTokens,
  inputTokenCostNanoDollars,
  outputTokenCostNanoDollars,
}: {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  cacheCreationInputTokens: number;
  memoryTokens: number;
  inputTokenCostNanoDollars: number;
  outputTokenCostNanoDollars: number;
}) {
  const baseCost = providerCostNanoDollars(
    inputTokens,
    outputTokens,
    inputTokenCostNanoDollars,
    outputTokenCostNanoDollars
  );
  const cachedDiscountRate = 0.9;
  const cachedSavings = Math.round(cachedInputTokens * inputTokenCostNanoDollars * cachedDiscountRate);
  const totalCost = Math.max(0, baseCost - cachedSavings);
  const creditsConsumed = creditsFromNanoDollars(totalCost);

  return {
    totalCost,
    creditsConsumed,
    regularInputTokens: Math.max(0, inputTokens - cachedInputTokens),
    cachedInputTokens,
    cacheCreationInputTokens,
    baseCost,
    memoryCost: Math.round(memoryTokens * inputTokenCostNanoDollars),
    cachedSavings,
    costBreakdown: {
      inputTokens,
      outputTokens,
      memoryTokens,
      cachedInputTokens,
      cacheCreationInputTokens,
      inputTokenCostNanoDollars,
      outputTokenCostNanoDollars,
      nanoDollarsPerCredit: Number(process.env.NANO_DOLLARS_PER_CREDIT ?? 1000),
      creditMarkupMultiplier: Number(process.env.CREDIT_MARKUP_MULTIPLIER ?? 1.25),
      totalIfNotCached: baseCost,
      totalActualCost: totalCost,
      creditsConsumed,
    },
  };
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
      creditsConsumed,
    }: {
      providerMappingId: number;
      output: string;
      inputTokensConsumed: number;
      outputTokensConsumed: number;
      creditsConsumed: number;
    }) => {
      try {
        await prisma.$transaction(
          async (tx) => {
            await tx.apiKey.update({
              where: {
                id: apiKeydb.id
              },
              data: {
                creditsConsumed: {
                  increment: creditsConsumed
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
                  decrement: creditsConsumed
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
        messages: body.messages,
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

    if (modeldb.minPlan === "pro" && apiKeydb.user.plan !== "pro") {
      logDeniedRequest({
        status: "error",
        errorType: "invalid_request",
      });

      return status(402, {
        message: "This model requires the Pro plan",
        requiredPlan: "pro",
        currentPlan: apiKeydb.user.plan,
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
    const memoryLimit = Math.min(20, Math.max(0, Number(query.memoryLimit ?? 5)));
    const memoryTokenBudget = Math.min(4000, Math.max(0, Number(query.memoryTokenBudget ?? 500)));
    const lastUserMessage = [...body.messages].reverse().find((message) => message.role === "user");
    const memories = await retrieveMemoryForUser(
      apiKeydb.user.id,
      apiKeydb.id,
      memoryLimit,
      memoryMode,
      lastUserMessage?.content,
      memoryTokenBudget
    );
    void markMemoriesUsed(memories.map((memory) => memory.id)).catch((error) => {
      console.error("Failed to mark memories used:", error);
    });
    const memoryTokens = memories.reduce((sum, memory) => {
      const rankedTokens = "estimatedTokens" in memory && typeof memory.estimatedTokens === "number"
        ? memory.estimatedTokens
        : estimateTokens(memory.content);
      return sum + rankedTokens;
    }, 0);
    const memoryContext = buildMemoryPrefix(memories);
    const memoryLogDetails = {
      injectedMemories: memories.map((memory) => ({
        memoryId: memory.id,
        content: memory.content,
        relevanceScore: "relevanceScore" in memory ? memory.relevanceScore : null,
        factors: "factors" in memory ? memory.factors : null,
        estimatedTokens: "estimatedTokens" in memory ? memory.estimatedTokens : null,
        isCompressed: memory.isCompressed,
      })),
      memoryCount: memories.length,
      memoryInjected: memories.length,
      memoryCost: memoryTokens,
      costBreakdown: {
        memoryTokens,
        memoryTokenBudget,
        memoryMode,
        cachingSupported: Boolean(memoryContext),
      },
    };

    if (body.stream) {
      const providerResult = await tryProviderFallbackStream({
        providers,
        modelName: providerModelName,
        messages: body.messages,
        cacheableContext: memoryContext,
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
          const accounting = selectedProviderMapping
            ? buildCostAccounting({
              inputTokens: usage.inputTokensConsumed,
              outputTokens: usage.outputTokensConsumed,
              cachedInputTokens: usage.cachedInputTokens ?? 0,
              cacheCreationInputTokens: usage.cacheCreationInputTokens ?? 0,
              memoryTokens,
              inputTokenCostNanoDollars: selectedProviderMapping.inputTokenCostNanoDollars,
              outputTokenCostNanoDollars: selectedProviderMapping.outputTokenCostNanoDollars,
            })
            : {
              totalCost: totalTokens(usage.inputTokensConsumed, usage.outputTokensConsumed),
              creditsConsumed: totalTokens(usage.inputTokensConsumed, usage.outputTokensConsumed),
              regularInputTokens: usage.inputTokensConsumed,
              cachedInputTokens: usage.cachedInputTokens ?? 0,
              cacheCreationInputTokens: usage.cacheCreationInputTokens ?? 0,
              baseCost: totalTokens(usage.inputTokensConsumed, usage.outputTokensConsumed),
              memoryCost: memoryTokens,
              cachedSavings: 0,
              costBreakdown: memoryLogDetails.costBreakdown,
            };

          void persistUsage({
            providerMappingId: providerResult.providerMappingId,
            output,
            inputTokensConsumed: usage.inputTokensConsumed,
            outputTokensConsumed: usage.outputTokensConsumed,
            creditsConsumed: accounting.creditsConsumed,
          });
          persistMemory(output);

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
            cost: accounting.totalCost,
            streaming: true,
            latencyMs: elapsedMs(requestStartedAt),
            ttftMs,
            ...memoryLogDetails,
            cachedInputTokens: accounting.cachedInputTokens,
            regularInputTokens: accounting.regularInputTokens,
            baseCost: accounting.baseCost,
            memoryCost: accounting.memoryCost,
            cachedSavings: accounting.cachedSavings,
            costBreakdown: accounting.costBreakdown,
          });
        },
      });
    }

    const providerResult = await tryProviderFallback({
      providers,
      modelName: providerModelName,
      messages: body.messages,
      cacheableContext: memoryContext,
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
    const accounting = selectedProviderMapping
      ? buildCostAccounting({
        inputTokens: response.inputTokensConsumed,
        outputTokens: response.outputTokensConsumed,
        cachedInputTokens: response.cachedInputTokens ?? 0,
        cacheCreationInputTokens: response.cacheCreationInputTokens ?? 0,
        memoryTokens,
        inputTokenCostNanoDollars: selectedProviderMapping.inputTokenCostNanoDollars,
        outputTokenCostNanoDollars: selectedProviderMapping.outputTokenCostNanoDollars,
      })
      : {
        totalCost: totalTokens(response.inputTokensConsumed, response.outputTokensConsumed),
        creditsConsumed: totalTokens(response.inputTokensConsumed, response.outputTokensConsumed),
        regularInputTokens: response.inputTokensConsumed,
        cachedInputTokens: response.cachedInputTokens ?? 0,
        cacheCreationInputTokens: response.cacheCreationInputTokens ?? 0,
        baseCost: totalTokens(response.inputTokensConsumed, response.outputTokensConsumed),
        memoryCost: memoryTokens,
        cachedSavings: 0,
        costBreakdown: memoryLogDetails.costBreakdown,
      };
    const responseCost = selectedProviderMapping
      ? providerCostNanoDollars(
        response.inputTokensConsumed,
        response.outputTokensConsumed,
        selectedProviderMapping.inputTokenCostNanoDollars,
        selectedProviderMapping.outputTokenCostNanoDollars
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
      creditsConsumed: accounting.creditsConsumed,
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
      cost: accounting.totalCost,
      streaming: false,
      latencyMs: elapsedMs(requestStartedAt),
      ttftMs: null,
      ...memoryLogDetails,
      cachedInputTokens: accounting.cachedInputTokens,
      regularInputTokens: accounting.regularInputTokens,
      baseCost: accounting.baseCost,
      memoryCost: accounting.memoryCost,
      cachedSavings: accounting.cachedSavings,
      costBreakdown: accounting.costBreakdown,
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
        t.Literal("none"),
        t.Literal("user"),
        t.Literal("api_key"),
      ])),
      memoryLimit: t.Optional(t.String()),
      memoryTokenBudget: t.Optional(t.String()),
    })
  })
  .listen(3002);

console.log(`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`);
