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
}

export class BaseLLM {
    static async chat(model: string, messages: Messages): Promise<LLMResponse> {
        throw new Error("Not implemented chat function")
    }
}