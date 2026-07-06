// apps/api_backend/src/routing/providerFallback.ts
import { Messages } from "../types";
import { LLMResponse, LLMStreamUsage } from "../llms/Base";
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

async function callProvider({
    providerName,
    modelName,
    messages,
}: {
    providerName: string,
    modelName: string,
    messages: Messages,
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
        return OpenAi.chat(modelName, messages);
    }

    if (providerName === "Claude API") {
        return Claude.chat(modelName, messages);
    }

    throw new Error(`Unsupported Provider: ${providerName}`);
}

async function callProviderStream({
    providerName,
    modelName,
    messages,
}: {
    providerName: string,
    modelName: string,
    messages: Messages,
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
        return OpenAi.chatStream(modelName, messages);
    }

    throw new Error(`Streaming not implemented for provider: ${providerName}`);
}

export async function tryProviderFallback({
    providers,
    modelName,
    messages,
}: {
    providers: ProviderMapping[],
    modelName: string,
    messages: Messages
}): Promise<ProviderFallbackResult> {
    const errors: { providerName: string, message: string }[] = [];

    let attemptedCount = 0;
    for (const provider of providers) {
        const providerName = provider.provider.name;
        attemptedCount += 1;

        try {
            const response = await callProvider({
                providerName,
                modelName,
                messages,
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
}: {
    providers: ProviderMapping[],
    modelName: string,
    messages: Messages
}): Promise<StreamProviderFallbackResult> {
    const errors: { providerName: string, message: string }[] = [];

    let attemptedCount = 0;
    for (const provider of providers) {
        const providerName = provider.provider.name;
        attemptedCount += 1;

        try {
            const stream = await callProviderStream({
                providerName,
                modelName,
                messages,
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
