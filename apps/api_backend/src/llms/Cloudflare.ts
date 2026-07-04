import { Messages } from "../types";
import { BaseLLM, LLMResponse } from "./Base";

const cloudflareAccountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const cloudflareApiToken = process.env.CLOUDFLARE_API_TOKEN;

export class Cloudflare extends BaseLLM {
    static async chat(model: string, messages: Messages): Promise<LLMResponse> {
        if (!cloudflareAccountId) {
            throw new Error("CLOUDFLARE_ACCOUNT_ID is missing");
        }

        if (!cloudflareApiToken) {
            throw new Error("CLOUDFLARE_API_TOKEN is missing");
        }

        const normalizedModel = model.startsWith("@cf/")
            ? model
            : `@cf/meta/${model}`;

        const endpoint = `https://api.cloudflare.com/client/v4/accounts/${cloudflareAccountId}/ai/run/${normalizedModel}`;

        const response = await fetch(
            endpoint,
            {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    authorization: `Bearer ${cloudflareApiToken}`,
                },
                body: JSON.stringify({
                    messages: messages.map((message) => ({
                        role: message.role,
                        content: message.content,
                    })),
                }),
            }
        );

        if (!response.ok) {
            console.error("Cloudflare Workers AI request failed:", {
                endpoint,
                status: response.status,
            });
            throw new Error(await response.text());
        }

        const data = await response.json() as {
            result?: {
                response?: string;
                output?: string;
            };
            usage?: {
                input_tokens?: number;
                output_tokens?: number;
            };
        };

        const content = data.result?.response ?? data.result?.output ?? "";

        return {
            inputTokensConsumed: data.usage?.input_tokens ?? 0,
            outputTokensConsumed: data.usage?.output_tokens ?? 0,
            completions: {
                choices: [{
                    message: {
                        content,
                    }
                }]
            }
        };
    }
}
