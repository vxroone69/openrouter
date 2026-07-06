import bearer from "@elysiajs/bearer";
import { cors } from "@elysiajs/cors";
import { prisma } from "db";
import { Elysia, t } from "elysia";
import { checkRateLimit } from "./rateLimit/slidingWindow";
import { tryProviderFallback, tryProviderFallbackStream } from "./routing/providerFallback";
import { createOpenAIChatCompletionStream } from "./streaming/openaiChatCompletionStream";

const app = new Elysia()
  .use(cors({
    origin: "http://localhost:3001",
    credentials: true,
  }))
  .use(bearer())
  .post("/api/v1/chat/completions", async ({ status, bearer: apiKey, body }) => {
    const model = body.model;
    const [, providerModelName] = model.split("/");

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

    const rateLimit = await checkRateLimit({
      key: `rate-limit:api-key:${apiKeydb.id}`,
      limit: Number(process.env.RATE_LIMIT_MAX_REQUESTS ?? 10),
      windowMs: Number(process.env.RATE_LIMIT_WINDOW_SECONDS ?? 60) * 1000,
    });

    if (!rateLimit.allowed) {
      return status(429, {
        message: "Rate limit exceeded",
        limit: rateLimit.limit,
        remaining: rateLimit.remaining,
        resetAt: rateLimit.resetAt,
      });
    }

    if (apiKeydb.user.credits <= 0) {
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

    if (providers.length === 0) {
      return status(403, {
        message: "No providers mapped for this model"
      });
    }

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
      const totalTokensConsumed = inputTokensConsumed + outputTokensConsumed;

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

    if (body.stream) {
      const providerResult = await tryProviderFallbackStream({
        providers,
        modelName: providerModelName,
        messages: body.messages,
      });

      if (!providerResult.ok) {
        return status(503, {
          message: "All providers failed",
          errors: providerResult.errors,
        });
      }

      return createOpenAIChatCompletionStream({
        model,
        firstChunk: providerResult.firstChunk,
        iterator: providerResult.iterator,
        onDone: (usage, output) =>
          persistUsage({
            providerMappingId: providerResult.providerMappingId,
            output,
            inputTokensConsumed: usage.inputTokensConsumed,
            outputTokensConsumed: usage.outputTokensConsumed,
          }),
      });
    }

    const providerResult = await tryProviderFallback({
      providers,
      modelName: providerModelName,
      messages: body.messages,
    });

    if (!providerResult.ok) {
      return status(503, {
        message: "All providers failed",
        errors: providerResult.errors,
      });
    }

    const response = providerResult.response;
    const output = response.completions.choices
      .map((choice) => choice.message.content)
      .join("\n");

    await persistUsage({
      providerMappingId: providerResult.providerMappingId,
      output,
      inputTokensConsumed: response.inputTokensConsumed,
      outputTokensConsumed: response.outputTokensConsumed,
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
    })
  })
  .listen(3002);

console.log(`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`);
