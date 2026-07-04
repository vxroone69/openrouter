import { Messages } from "../types";
import { BaseLLM, LLMResponse } from "./Base";

export class Groq extends BaseLLM {
    static async chat(model: string, messages: Messages): Promise<LLMResponse> {
        const apiKey = process.env.GROQ_API_KEY;

        if (!apiKey) {
            throw new Error("GROQ_API_KEY is missing");
        }

        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                messages,
                max_tokens: 256,
                temperature: 0,
            }),
        });

        if (!response.ok) {
            throw new Error(await response.text());
        }

        const data = await response.json() as {
            choices?: {
                message?: {
                    content?: string;
                };
            }[];
            usage?: {
                prompt_tokens?: number;
                completion_tokens?: number;
            };
        };

        return {
            inputTokensConsumed: data.usage?.prompt_tokens ?? 0,
            outputTokensConsumed: data.usage?.completion_tokens ?? 0,
            completions: {
                choices: [{
                    message: {
                        content: data.choices?.[0]?.message?.content ?? "",
                    }
                }]
            }
        };
    }
}
