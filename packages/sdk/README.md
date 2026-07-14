# Synapse SDK

TypeScript SDK for calling the Synapse gateway from server-side applications.

```ts
import { Synapse } from "@synapse/sdk";

const synapse = new Synapse({
  apiKey: process.env.SYNAPSE_API_KEY!,
  baseUrl: "https://your-api-backend.com",
});

const completion = await synapse.chat.completions.create({
  model: "groq/llama-3.1-8b-instant",
  memory: "user",
  messages: [{ role: "user", content: "Write a short support reply." }],
});
```

Keep Synapse API keys on your server. Do not expose them in browser code.
