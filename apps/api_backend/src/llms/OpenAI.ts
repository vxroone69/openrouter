import { Messages } from "../types";
import { BaseLLM, LLMResponse, LLMStreamUsage } from "./Base";
import OpenAI from "openai";

const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

export class OpenAi extends BaseLLM {
    static async chat(model: string, messages: Messages): Promise<LLMResponse> {
        const response = await client.responses.create({
            model,
            input: messages.map((message) => ({
                role: message.role,
                content: message.content
            }))
        });

        return {
            inputTokensConsumed: response.usage?.input_tokens ?? 0,
            outputTokensConsumed: response.usage?.output_tokens ?? 0,
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
        messages: Messages
    ): AsyncGenerator<string, LLMStreamUsage> {
        const stream = client.responses.stream({
            model,
            input: messages.map((message) => ({
                role: message.role,
                content: message.content
            })),
            max_output_tokens: 256,
        });

        for await (const event of stream) {
            if (event.type === "response.output_text.delta" && event.delta) {
                yield event.delta;
            }
        }

        const finalResponse = await stream.finalResponse();

        return {
            inputTokensConsumed: finalResponse.usage?.input_tokens ?? 0,
            outputTokensConsumed: finalResponse.usage?.output_tokens ?? 0,
        };
    }
}