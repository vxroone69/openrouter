import type { RetrievedMemory } from "./retrieveMemory";

export function buildMemoryPrefix(memories: RetrievedMemory[]) {
    if (memories.length === 0) return "";

    const lines = memories.map((memory) => {
        const source = memory.source ? ` | source: ${memory.source}` : "";
        return `- [${memory.scope}] ${memory.content}${source}`;
    });

    return [
        "Relevant memory:",
        ...lines,
        "Use this only if it helps answer the current request.",
    ].join("\n");
}
