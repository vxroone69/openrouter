import { BaseLLM, LLMResponse } from "./Base";
import { Messages } from "../types";

export class Claude extends BaseLLM {
    static async chat(model: string, messages: Messages): Promise<LLMResponse> {
        const apiKey = process.env.ANTHROPIC_API_KEY;

        if (!apiKey) {
            throw new Error("ANTHROPIC_API_KEY is missing");
        }

        const response = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-api-key": apiKey,
                "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
                model,
                max_tokens: 256,
                messages: messages.map((message) => ({
                    role: message.role,
                    content: message.content,
                })),
            }),
        });

        if (!response.ok) {
            throw new Error(await response.text());
        }

        const data = await response.json() as {
            content?: { text?: string }[];
            usage?: {
                input_tokens?: number;
                output_tokens?: number;
            };
        };

        return {
            inputTokensConsumed: data.usage?.input_tokens ?? 0,
            outputTokensConsumed: data.usage?.output_tokens ?? 0,
            completions: {
                choices: [{
                    message: {
                        content: data.content?.map((part) => part.text ?? "").join("") ?? "",
                    }
                }]
            }
        };
    }

}
