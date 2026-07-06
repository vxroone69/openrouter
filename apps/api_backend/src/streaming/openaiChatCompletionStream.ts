import { LLMStreamUsage } from "../llms/Base";

const encoder = new TextEncoder();

function buildChunk({
    id,
    model,
    created,
    delta,
    finishReason = null,
    usage,
}: {
    id: string;
    model: string;
    created: number;
    delta: {
        role?: "assistant";
        content?: string;
    };
    finishReason?: "stop" | null;
    usage?: LLMStreamUsage;
}) {
    const payload: Record<string, unknown> = {
        id,
        object: "chat.completion.chunk",
        created,
        model,
        choices: [
            {
                index: 0,
                delta,
                finish_reason: finishReason,
            },
        ],
    };

    if (usage) {
        payload.usage = {
            prompt_tokens: usage.inputTokensConsumed,
            completion_tokens: usage.outputTokensConsumed,
            total_tokens: usage.inputTokensConsumed + usage.outputTokensConsumed,
        };
    }

    return `data: ${JSON.stringify(payload)}\n\n`;
}

export function createOpenAIChatCompletionStream({
    model,
    firstChunk,
    iterator,
    onFirstContentChunk,
    onDone,
}: {
    model: string;
    firstChunk: string;
    iterator: AsyncIterator<string, LLMStreamUsage>;
    onFirstContentChunk?: () => void;
    onDone: (usage: LLMStreamUsage, output: string) => Promise<void> | void;
}) {
    const id = `chatcmpl-${crypto.randomUUID()}`;
    const created = Math.floor(Date.now() / 1000);

    return new Response(
        new ReadableStream<Uint8Array>({
            start(controller) {
                const output: string[] = [];
                let hasMarkedFirstContentChunk = false;

                const push = (value: string) => {
                    controller.enqueue(encoder.encode(value));
                };

                const markFirstContentChunk = () => {
                    if (!hasMarkedFirstContentChunk) {
                        hasMarkedFirstContentChunk = true;
                        onFirstContentChunk?.();
                    }
                };

                (async () => {
                    push(buildChunk({
                        id,
                        model,
                        created,
                        delta: { role: "assistant" },
                    }));

                    if (firstChunk) {
                        output.push(firstChunk);
                        markFirstContentChunk();
                        push(buildChunk({
                            id,
                            model,
                            created,
                            delta: { content: firstChunk },
                        }));
                    }

                    let usage: LLMStreamUsage = {
                        inputTokensConsumed: 0,
                        outputTokensConsumed: 0,
                    };

                    while (true) {
                        const next = await iterator.next();

                        if (next.done) {
                            usage = next.value ?? usage;
                            break;
                        }

                        output.push(next.value);
                        markFirstContentChunk();
                        push(buildChunk({
                            id,
                            model,
                            created,
                            delta: { content: next.value },
                        }));
                    }

                    push(buildChunk({
                        id,
                        model,
                        created,
                        delta: {},
                        finishReason: "stop",
                        usage,
                    }));

                    push("data: [DONE]\n\n");
                    controller.close();

                    void Promise.resolve(onDone(usage, output.join(""))).catch((error) => {
                        console.error("Failed to persist streamed usage:", error);
                    });
                })().catch((error) => controller.error(error));
            },
        }),
        {
            headers: {
                "content-type": "text/event-stream; charset=utf-8",
                "cache-control": "no-cache, no-transform",
                connection: "keep-alive",
                "x-accel-buffering": "no",
            },
        }
    );
}
