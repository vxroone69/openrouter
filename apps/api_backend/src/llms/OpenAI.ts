import { Messages } from "../types";
import { BaseLLM, LLMCallOptions, LLMResponse, LLMStreamUsage } from "./Base";
import OpenAI from "openai";

const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

export class OpenAi extends BaseLLM {
    static async chat(model: string, messages: Messages, options: LLMCallOptions = {}): Promise<LLMResponse> {
        const input = [
            ...(options.cacheableContext ? [{
                role: "system",
                content: [{
                    type: "input_text",
                    text: options.cacheableContext,
                    cache_control: { type: "ephemeral" },
                }],
            }] : []),
            ...messages.map((message) => ({
                role: message.role,
                content: message.content
            })),
        ];
        const response = await client.responses.create({
            model,
            input: input as never,
        });
        const usage = response.usage as typeof response.usage & {
            input_tokens_details?: {
                cached_tokens?: number;
            };
        };

        return {
            inputTokensConsumed: response.usage?.input_tokens ?? 0,
            outputTokensConsumed: response.usage?.output_tokens ?? 0,
            cachedInputTokens: usage?.input_tokens_details?.cached_tokens ?? 0,
            completions: {
                choices: [{
                    message: {
                        content: response.output_text ?? ""
                    }
                }]
            }
        };
    }

    static async *chatStream(
        model: string,
        messages: Messages,
        options: LLMCallOptions = {}
    ): AsyncGenerator<string, LLMStreamUsage> {
        const input = [
            ...(options.cacheableContext ? [{
                role: "system",
                content: [{
                    type: "input_text",
                    text: options.cacheableContext,
                    cache_control: { type: "ephemeral" },
                }],
            }] : []),
            ...messages.map((message) => ({
                role: message.role,
                content: message.content
            })),
        ];
        const stream = client.responses.stream({
            model,
            input: input as never,
            max_output_tokens: 256,
        });

        for await (const event of stream) {
            if (event.type === "response.output_text.delta" && event.delta) {
                yield event.delta;
            }
        }

        const finalResponse = await stream.finalResponse();
        const usage = finalResponse.usage as typeof finalResponse.usage & {
            input_tokens_details?: {
                cached_tokens?: number;
            };
        };

        return {
            inputTokensConsumed: finalResponse.usage?.input_tokens ?? 0,
            outputTokensConsumed: finalResponse.usage?.output_tokens ?? 0,
            cachedInputTokens: usage?.input_tokens_details?.cached_tokens ?? 0,
        };
    }
}
