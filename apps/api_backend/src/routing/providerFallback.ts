import { Messages } from "../types";
import { LLMResponse } from "../llms/Base";
import { Gemini } from "../llms/Google";
import { OpenAi } from "../llms/OpenAI";
import { Claude } from "../llms/Claude";
import { Groq } from "../llms/Groq";
import { Cloudflare } from "../llms/Cloudflare";

type ProviderMapping = {
    id : number,
    provider : {
        name : string
    }
}

type ProviderFallbackResult = 
    | {
        ok: true,
        response: LLMResponse,
        providerMappingId: number,
        providerName: string
    }
    | {
        ok: false,
        errors : {
            providerName: string,
            message: string,
        }[];
    };

async function callProvider({
    providerName,
    modelName,
    messages,
}: {
    providerName: string,
    modelName: string,
    messages: Messages,
}): Promise<LLMResponse> {
  if (providerName == "Google API" || providerName == "Google Vertex"){
        return Gemini.chat(modelName, messages)
    }
  if (providerName === "Groq API") {
        return Groq.chat(modelName, messages);
    }
  if (providerName === "Cloudflare Workers AI") {
        const cloudflareModel = modelName.startsWith("@cf/")
            ? modelName
            : `@cf/meta/${modelName}`;

        return Cloudflare.chat(cloudflareModel, messages);
    }
  if (providerName === "OpenAI API") {
    return OpenAi.chat(modelName, messages);
  }

  if (providerName === "Claude API") {
    return Claude.chat(modelName, messages);
  }

  throw new Error(`Unsupported Provider: ${providerName}`);
}

export async function tryProviderFallback({
    providers,
    modelName,
    messages,
}: {
    providers: ProviderMapping[],
    modelName: string, 
    messages: Messages
}): Promise<ProviderFallbackResult> {
    const errors: {providerName: string, message: string}[] = [];
    console.log("provider fallback order:", providers.map((provider) => provider.provider.name));

    for (const provider of providers){
        const providerName = provider.provider.name;
        console.log("trying provider:", providerName);

        try {
            const response = await callProvider({
                providerName,
                modelName,
                messages
            });

            return {
                ok: true,
                response,
                providerMappingId: provider.id,
                providerName,
            };
        } catch (error) {
            errors.push({
                providerName,
                message: error instanceof Error ?
                         error.message : 
                         "Unknown provider Error"
            })
        }
    }

    return {
        ok: false,
        errors,
    };

}
