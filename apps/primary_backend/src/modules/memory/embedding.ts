export async function generateMemoryEmbedding(text: string) {
    if (!process.env.GOOGLE_API_KEY) return null;

    const models = [
        process.env.MEMORY_EMBEDDING_MODEL,
        "gemini-embedding-001",
        "text-embedding-004",
        "embedding-001",
    ].filter((model): model is string => Boolean(model));
    const errors: unknown[] = [];

    for (const model of models) {
        try {
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${process.env.GOOGLE_API_KEY}`,
                {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                        content: {
                            parts: [{ text }],
                        },
                    }),
                }
            );

            if (!response.ok) {
                throw new Error(await response.text());
            }

            const data = await response.json() as {
                embedding?: {
                    values?: number[];
                };
            };

            if (data.embedding?.values?.length) {
                return data.embedding.values;
            }
        } catch (error) {
            errors.push(error);
        }
    }

    console.error("Memory embedding generation failed for all configured models:", errors.at(-1));
    return null;
}

export async function generateMemoryCompression(prompt: string) {
    if (!process.env.GOOGLE_API_KEY) return null;

    try {
        const model = process.env.MEMORY_COMPRESSION_MODEL ?? "gemini-2.5-flash";
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GOOGLE_API_KEY}`,
            {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    contents: [{
                        role: "user",
                        parts: [{ text: prompt }],
                    }],
                }),
            }
        );

        if (!response.ok) {
            throw new Error(await response.text());
        }

        const data = await response.json() as {
            candidates?: Array<{
                content?: {
                    parts?: Array<{ text?: string }>;
                };
            }>;
        };

        return data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim() || null;
    } catch (error) {
        console.error("Memory compression failed:", error);
        return null;
    }
}

export function toPgVector(vector: number[]) {
    return `[${vector.join(",")}]`;
}
