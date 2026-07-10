import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GOOGLE_API_KEY,
});

export type EmbeddingVector = number[];

const embeddingModels = [
  process.env.MEMORY_EMBEDDING_MODEL,
  "gemini-embedding-001",
  "text-embedding-004",
  "embedding-001",
].filter((model): model is string => Boolean(model));

export async function generateMemoryEmbedding(text: string): Promise<EmbeddingVector | null> {
  if (!process.env.GOOGLE_API_KEY) {
    return null;
  }

  const errors: unknown[] = [];

  for (const model of embeddingModels) {
    try {
      const response = await ai.models.embedContent({
        model,
        contents: text,
      });

      const values = response.embeddings?.[0]?.values;
      if (values && values.length > 0) {
        return values;
      }
    } catch (error) {
      errors.push(error);
    }
  }

  console.error("Memory embedding generation failed for all configured models:", errors.at(-1));
  return null;
}

export function toPgVector(vector: EmbeddingVector) {
  return `[${vector.join(",")}]`;
}
