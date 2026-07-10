// apps/api_backend/src/routing/providerFallback.ts
import { Messages } from "../types";
import { LLMCallOptions, LLMResponse, LLMStreamUsage } from "../llms/Base";
import { Gemini } from "../llms/Google";
import { OpenAi } from "../llms/OpenAI";
import { Claude } from "../llms/Claude";
import { Groq } from "../llms/Groq";
import { Cloudflare } from "../llms/Cloudflare";

type ProviderMapping = {
    id: number,
    provider: {
        name: string
    }
};

type ProviderFallbackResult =
    | {
        ok: true,
        response: LLMResponse,
        providerMappingId: number,
        providerName: string,
        attemptedCount: number,
    }
    | {
        ok: false,
        attemptedCount: number,
        lastProviderName?: string,
        errors: {
            providerName: string,
            message: string,
        }[];
    };

type StreamProviderFallbackResult =
    | {
        ok: true,
        providerMappingId: number,
        providerName: string,
        attemptedCount: number,
        iterator: AsyncIterator<string, LLMStreamUsage>,
        firstChunk: string,
    }
    | {
        ok: false,
        attemptedCount: number,
        lastProviderName?: string,
        errors: {
            providerName: string,
            message: string,
        }[];
    };

function supportsStructuredCache(providerName: string) {
    return providerName === "OpenAI API" || providerName === "Claude API";
}

function withPlainMemoryContext(messages: Messages, cacheableContext?: string | null): Messages {
    if (!cacheableContext) return messages;

    if (messages.length === 0) {
        return [{ role: "user", content: cacheableContext }];
    }

    const [firstMessage, ...rest] = messages;
    return [
        {
            ...firstMessage,
            content: `${cacheableContext}\n\n${firstMessage.content}`,
        },
        ...rest,
    ];
}

async function callProvider({
    providerName,
    modelName,
    messages,
    options,
}: {
    providerName: string,
    modelName: string,
    messages: Messages,
    options?: LLMCallOptions,
}): Promise<LLMResponse> {
    if (providerName == "Google API" || providerName == "Google Vertex") {
        return Gemini.chat(modelName, messages);
    }

    if (providerName === "Groq API") {
        return Groq.chat(modelName, messages);
    }

    if (providerName === "Cloudflare Workers AI") {
        const cloudflareModel = modelName.startsWith("@cf/")
            ? modelName
            : `@cf/meta/${modelName}`;

        return Cloudflare.chat(cloudflareModel, messages);
    }

    if (providerName === "OpenAI API") {
        return OpenAi.chat(modelName, messages, options);
    }

    if (providerName === "Claude API") {
        return Claude.chat(modelName, messages, options);
    }

    throw new Error(`Unsupported Provider: ${providerName}`);
}

async function callProviderStream({
    providerName,
    modelName,
    messages,
    options,
}: {
    providerName: string,
    modelName: string,
    messages: Messages,
    options?: LLMCallOptions,
}): Promise<AsyncGenerator<string, LLMStreamUsage>> {
    if (providerName === "Google API" || providerName === "Google Vertex") {
        return Gemini.chatStream(modelName, messages);
    }

    if (providerName === "Groq API") {
        return Groq.chatStream(modelName, messages);
    }

    if (providerName === "Cloudflare Workers AI") {
        const cloudflareModel = modelName.startsWith("@cf/")
            ? modelName
            : `@cf/meta/${modelName}`;

        return Cloudflare.chatStream(cloudflareModel, messages);
    }

    if (providerName === "OpenAI API") {
        return OpenAi.chatStream(modelName, messages, options);
    }

    throw new Error(`Streaming not implemented for provider: ${providerName}`);
}

export async function tryProviderFallback({
    providers,
    modelName,
    messages,
    cacheableContext,
}: {
    providers: ProviderMapping[],
    modelName: string,
    messages: Messages,
    cacheableContext?: string | null,
}): Promise<ProviderFallbackResult> {
    const errors: { providerName: string, message: string }[] = [];

    let attemptedCount = 0;
    for (const provider of providers) {
        const providerName = provider.provider.name;
        attemptedCount += 1;

        try {
            const providerMessages = supportsStructuredCache(providerName)
                ? messages
                : withPlainMemoryContext(messages, cacheableContext);
            const response = await callProvider({
                providerName,
                modelName,
                messages: providerMessages,
                options: supportsStructuredCache(providerName)
                    ? { cacheableContext }
                    : undefined,
            });

            return {
                ok: true,
                response,
                providerMappingId: provider.id,
                providerName,
                attemptedCount,
            };
        } catch (error) {
            errors.push({
                providerName,
                message: error instanceof Error
                    ? error.message
                    : "Unknown provider Error",
            });
        }
    }

    return {
      ok: false,
      attemptedCount,
      lastProviderName: providers.at(-1)?.provider.name,
      errors,
    };
}

export async function tryProviderFallbackStream({
    providers,
    modelName,
    messages,
    cacheableContext,
}: {
    providers: ProviderMapping[],
    modelName: string,
    messages: Messages,
    cacheableContext?: string | null,
}): Promise<StreamProviderFallbackResult> {
    const errors: { providerName: string, message: string }[] = [];

    let attemptedCount = 0;
    for (const provider of providers) {
        const providerName = provider.provider.name;
        attemptedCount += 1;

        try {
            const providerMessages = supportsStructuredCache(providerName)
                ? messages
                : withPlainMemoryContext(messages, cacheableContext);
            const stream = await callProviderStream({
                providerName,
                modelName,
                messages: providerMessages,
                options: supportsStructuredCache(providerName)
                    ? { cacheableContext }
                    : undefined,
            });

            const iterator = stream[Symbol.asyncIterator]();
            const first = await iterator.next();

            if (first.done) {
                throw new Error("Provider returned an empty stream");
            }

            return {
                ok: true,
                providerMappingId: provider.id,
                providerName,
                attemptedCount,
                iterator,
                firstChunk: first.value,
            };
        } catch (error) {
            errors.push({
                providerName,
                message: error instanceof Error
                    ? error.message
                    : "Unknown provider Error",
            });
        }
    }

    return {
      ok: false,
      attemptedCount,
      lastProviderName: providers.at(-1)?.provider.name,
      errors,
    };
}
