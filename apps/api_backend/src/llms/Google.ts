import { Messages } from "../types";
import { BaseLLM, LLMResponse, LLMStreamUsage } from "./Base";
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
    apiKey: process.env.GOOGLE_API_KEY
});

export class Gemini extends BaseLLM {
    static async chat(model: string, messages: Messages): Promise<LLMResponse> {
        const response = await ai.models.generateContent({
            model,
            contents: messages.map((message) => ({
                text: message.content,
                role: message.role
            }))
        });

        return {
            outputTokensConsumed: response.usageMetadata?.candidatesTokenCount ?? 0,
            inputTokensConsumed: response.usageMetadata?.promptTokenCount ?? 0,
            completions: {
                choices: [{
                    message: {
                        content: response.text ?? ""
                    }
                }]
            }
        };
    }

    static async *chatStream(
        model: string,
        messages: Messages
    ): AsyncGenerator<string, LLMStreamUsage> {
        const stream = await ai.models.generateContentStream({
            model,
            contents: messages.map((message) => ({
                text: message.content,
                role: message.role
            })),
            config: {
                maxOutputTokens: 256,
                temperature: 0,
            }
        });

        let usage: LLMStreamUsage = {
            inputTokensConsumed: 0,
            outputTokensConsumed: 0,
        };

        for await (const chunk of stream) {
            usage = {
                inputTokensConsumed: chunk.usageMetadata?.promptTokenCount ?? usage.inputTokensConsumed,
                outputTokensConsumed: chunk.usageMetadata?.candidatesTokenCount ?? usage.outputTokensConsumed,
            };

            if (chunk.text) {
                yield chunk.text;
            }
        }

        return usage;
    }
}