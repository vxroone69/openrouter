import { Messages } from "../types";
import { BaseLLM, LLMResponse, LLMStreamUsage } from "./Base";
import OpenAI from "openai";

const client = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1",
});

export class Groq extends BaseLLM {
    static async chat(model: string, messages: Messages): Promise<LLMResponse> {
        const response = await client.chat.completions.create({
            model,
            messages,
            max_tokens: 256,
            temperature: 0,
        });

        return {
            inputTokensConsumed: response.usage?.prompt_tokens ?? 0,
            outputTokensConsumed: response.usage?.completion_tokens ?? 0,
            completions: {
                choices: [{
                    message: {
                        content: response.choices?.[0]?.message?.content ?? ""
                    }
                }]
            }
        };
    }

    static async *chatStream(
        model: string,
        messages: Messages
    ): AsyncGenerator<string, LLMStreamUsage> {
        const stream = await client.chat.completions.create({
            model,
            messages,
            max_tokens: 256,
            temperature: 0,
            stream: true,
            stream_options: {
                include_usage: true,
            },
        });

        let usage: LLMStreamUsage = {
            inputTokensConsumed: 0,
            outputTokensConsumed: 0,
        };

        for await (const chunk of stream) {
            const delta = chunk.choices?.[0]?.delta?.content;

            if (delta) {
                yield delta;
            }

            if (chunk.usage) {
                usage = {
                    inputTokensConsumed: chunk.usage.prompt_tokens ?? usage.inputTokensConsumed,
                    outputTokensConsumed: chunk.usage.completion_tokens ?? usage.outputTokensConsumed,
                };
            }
        }

        return usage;
    }
}