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
    outputTokensConsumed: number
};

export type LLMStreamUsage = {
    inputTokensConsumed: number;
    outputTokensConsumed: number;
};

export class BaseLLM {
    static async chat(model: string, messages: Messages): Promise<LLMResponse> {
        throw new Error("Not implemented chat function");
    }

    static async *chatStream(
        model: string,
        messages: Messages
    ): AsyncGenerator<string, LLMStreamUsage> {
        throw new Error("Not implemented stream function");
    }
}