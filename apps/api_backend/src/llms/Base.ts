import { Messages } from "../types";

export type LLMResponse = {
    completions: {
        choices: {
            message: {
                content: string
            }
        }[]
    },
    inputTokensConsumed: number,
    outputTokensConsumed: number,
    cachedInputTokens?: number,
    cacheCreationInputTokens?: number,
};

export type LLMStreamUsage = {
    inputTokensConsumed: number;
    outputTokensConsumed: number;
    cachedInputTokens?: number;
    cacheCreationInputTokens?: number;
};

export type LLMCallOptions = {
    cacheableContext?: string | null;
};

export class BaseLLM {
    static async chat(model: string, messages: Messages, options?: LLMCallOptions): Promise<LLMResponse> {
        throw new Error("Not implemented chat function");
    }

    static async *chatStream(
        model: string,
        messages: Messages,
        options?: LLMCallOptions
    ): AsyncGenerator<string, LLMStreamUsage> {
        throw new Error("Not implemented stream function");
    }
}
