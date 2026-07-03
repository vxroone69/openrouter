import bearer from "@elysiajs/bearer";
import { prisma } from "db";
import { Elysia, t } from "elysia";
import { Conversation } from "./types";
import { Gemini } from "./llms/Google";
import { OpenAi } from "./llms/OpenAI";
import { Claude } from "./llms/Claude";
import { LLMResponse } from "./llms/Base";
import { checkRateLimit } from "./rateLimit/slidingWindow";
import { tryProviderFallback } from "./routing/providerFallback";

const app = new Elysia()
.use(bearer())
.post("/api/v1/chat/completions", async({status, bearer: apiKey, body}) => {
  const model = body.model
  const [companyName, ProviderModelName] = model.split("/");
  const apiKeydb = await prisma.apiKey.findFirst({
    where: {
      apiKey,
      disabled: false,
      deleted: false
	    },
	    select: {
	      id: true,
	      user: true
	    }
	  })

	  if (!apiKeydb){
	    return status(403, {
	      message: "Invalid API Key"
	    })
  }

  const rateLimit = await checkRateLimit({
    key: `rate-limit:api-key:${apiKeydb.id}`,
    limit: Number(process.env.RATE_LIMIT_MAX_REQUESTS ?? 10),
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_SECONDS ?? 60) * 1000,
  });

  if (!rateLimit.allowed) {
    return status(429, {
      message: "Rate limit exceeded",
      limit: rateLimit.limit,
      remaining: rateLimit.remaining,
      resetAt: rateLimit.resetAt,
    });
  }

  if (apiKeydb?.user.credits <= 0) {
    return status(403, {
      message: "Insufficient Credits"
    })
  }

  const modeldb = await prisma.model.findFirst({
    where: {
      slug: model
    }
  })

  if (!modeldb) {
    return status(403, {
      message: "Unsupported Model"
    })
  }

  const providers = await prisma.modelProviderMapping.findMany({
    where: {
      modelId: modeldb.id
    },
    include: {
      provider: true
    },
	orderBy: {
		id: "asc"
	}
  })

  if (providers.length === 0) {
  return status(403, {
    message: "No providers mapped for this model"
  });
}

  const providerResult = await tryProviderFallback({
  providers,
  modelName: ProviderModelName,
  messages: body.messages,
});

if (!providerResult.ok) {
  return status(503, {
    message: "All providers failed",
    errors: providerResult.errors,
  });
}

const response = providerResult.response;

	  const totalTokensConsumed = response.inputTokensConsumed + response.outputTokensConsumed;
	  const output = response.completions.choices
	    .map(choice => choice.message.content)
	    .join("\n");

	  await prisma.$transaction([
	    prisma.apiKey.update({
	      where: {
	        id: apiKeydb.id
	      },
	      data: {
	        creditsConsumed: {
	          increment: totalTokensConsumed
	        },
	        lastUsed: new Date()
	      }
	    }),
	    prisma.user.update({
	      where: {
	        id: apiKeydb.user.id
	      },
	      data: {
	        credits: {
	          decrement: totalTokensConsumed
	        }
	      }
	    }),
	    prisma.conversation.create({
	      data: {
	        conversationId: crypto.randomUUID(),
	        input: JSON.stringify(body.messages),
	        output,
	        inputTokenCount: response.inputTokensConsumed,
	        outputTokenCount: response.outputTokensConsumed,
	        userId: apiKeydb.user.id,
	        apiKeyId: apiKeydb.id,
	        modelProviderMappingId: providerResult.providerMappingId
	      }
	    })
	  ]);
	
	  return response;
	
		},{
	  body: t.Object({
	    model: t.String(),
	    messages: t.Array(t.Object({
	      role: t.Enum({
            user: "user", 
            assistant : "assistant"}),
      content: t.String()
    }))
  })


}).listen(3000);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);
