import type { Messages } from "../types";
import type { RetrievedMemory } from "./retrieveMemory";
import { buildMemoryPrefix } from "./buildMemoryPrefix";

export function injectMemoryIntoMessages(messages: Messages, memory: RetrievedMemory[]): Messages {
    const prefix = buildMemoryPrefix(memory);

    if (!prefix) {
        return messages
    }

    if (messages.length === 0) {
        return [
            {
                role: "user",
                content: prefix,
            },
        ];
    }

    const [firstMessage, ...rest] = messages;

    return [
        {
            ...firstMessage,
            content: `${prefix}\n\n${firstMessage.content}`,
        },
        ...rest,
    ];
}
