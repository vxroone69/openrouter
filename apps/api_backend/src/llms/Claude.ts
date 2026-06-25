import { BaseLLM, LLMResponse } from "./Base";
import { Messages } from "../types";
import { MessageListener } from "bun";

export class Claude extends BaseLLM {
    static async chat(model: string, message: Messages[]): Promise<LLMResponse> {
        throw new Error("Chat function not implemented");
    }

}