import { prisma } from "db";
import type { Messages } from "../types";
import { Groq } from "../llms/Groq";
import { OpenAi } from "../llms/OpenAI";
import { Gemini } from "../llms/Google";

type MemoryScope = "conversation" | "user" | "project" | "semantic";
type MemoryOwner = "user" | "api_key";

type MemoryCandidate = {
  content: string;
  scope: MemoryScope;
  owner: MemoryOwner;
  confidence: number;
  importance: number;
};

type MemoryClassification = {
  shouldStore: boolean;
  content: string;
  owner: MemoryOwner;
  scope: MemoryScope;
  confidence: number;
  importance: number;
};

function normalizeMemoryText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function clipMemoryText(text: string, maxLength = 260) {
  const normalized = normalizeMemoryText(text);

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function detectObviousNonMemory(text: string) {
  const lower = text.toLowerCase();

  if (
    lower.startsWith("what ") ||
    lower.startsWith("why ") ||
    lower.startsWith("how ") ||
    lower.startsWith("when ") ||
    lower.startsWith("where ") ||
    lower.startsWith("who ") ||
    lower.startsWith("tell me ") ||
    lower.startsWith("explain ") ||
    lower.startsWith("write ") ||
    lower.startsWith("summarize ") ||
    lower.startsWith("list ") ||
    lower.startsWith("generate ") ||
    lower.startsWith("give me ") ||
    lower.startsWith("show me ") ||
    lower.includes("joke") ||
    lower.includes("predict") ||
    lower.includes("answer in") ||
    lower.includes("respond in")
  ) {
    return true;
  }

  return false;
}

function detectObviousMemoryHint(text: string): MemoryOwner | null {
  const lower = text.toLowerCase();

  if (
    lower.includes("for this key") ||
    lower.includes("for this api key") ||
    lower.includes("for this app") ||
    lower.includes("for this project") ||
    lower.includes("for titan") ||
    lower.includes("for prod") ||
    lower.includes("for production") ||
    lower.includes("for staging") ||
    lower.includes("in this environment")
  ) {
    return "api_key";
  }

  if (
    lower.includes("my name is") ||
    lower.includes("i am ") ||
    lower.includes("i'm ") ||
    lower.includes("i live ") ||
    lower.includes("i work ") ||
    lower.includes("i like ") ||
    lower.includes("i love ") ||
    lower.includes("i prefer ") ||
    lower.includes("remember that")
  ) {
    return "user";
  }

  return null;
}

function buildCandidateFromRules(text: string): MemoryCandidate | null {
  const ownerHint = detectObviousMemoryHint(text);
  if (!ownerHint) {
    return null;
  }

  if (ownerHint === "user") {
    return {
      content: clipMemoryText(text),
      scope: "user",
      owner: "user",
      confidence: 0.68,
      importance: 2,
    };
  }

  return {
    content: clipMemoryText(text),
    scope: "conversation",
    owner: "api_key",
    confidence: 0.72,
    importance: 2,
  };
}

async function classifyWithLLM(text: string): Promise<MemoryClassification | null> {
  const classifierPrompt = [
    {
      role: "user" as const,
      content:
        "Classify the following user message for memory storage.\n" +
        "Return only valid JSON with keys: shouldStore, owner, scope, content, confidence, importance.\n" +
        "Rules:\n" +
        "- shouldStore must be true only if the message contains useful durable information.\n" +
        '- owner must be "user" for user-wide facts/preferences, or "api_key" for app/project/environment-specific facts.\n' +
        '- scope must be one of: conversation, user, project, semantic.\n' +
        "- content should be a short cleaned memory sentence.\n" +
        "- confidence should be a number from 0 to 1.\n" +
        "- importance should be an integer from 1 to 5.\n" +
        "User message:\n" +
        text,
    },
  ];

  const providers = [
    async () => {
      const model = process.env.MEMORY_CLASSIFIER_MODEL ?? "llama-3.1-8b-instant";
      return Groq.chat(model, classifierPrompt);
    },
    async () => {
      const model = process.env.MEMORY_CLASSIFIER_MODEL ?? "gpt-4.1-mini";
      return OpenAi.chat(model, classifierPrompt);
    },
    async () => {
      const model = process.env.MEMORY_CLASSIFIER_MODEL ?? "gemini-2.5-flash";
      return Gemini.chat(model, classifierPrompt);
    },
  ];

  let lastError: unknown = null;

  for (const provider of providers) {
    try {
      const response = await provider();
      const raw = response.completions.choices[0]?.message.content?.trim() ?? "";

      const parsed = JSON.parse(raw) as Partial<MemoryClassification>;
      if (
        typeof parsed.shouldStore !== "boolean" ||
        typeof parsed.content !== "string" ||
        (parsed.owner !== "user" && parsed.owner !== "api_key") ||
        (parsed.scope !== "conversation" &&
          parsed.scope !== "user" &&
          parsed.scope !== "project" &&
          parsed.scope !== "semantic")
      ) {
        return null;
      }

      if (!parsed.shouldStore || !parsed.content.trim()) {
        return null;
      }

      return {
        shouldStore: true,
        owner: parsed.owner,
        scope: parsed.scope,
        content: clipMemoryText(parsed.content),
        confidence: Math.min(1, Math.max(0, parsed.confidence ?? 0.6)),
        importance: Math.min(5, Math.max(1, Math.round(parsed.importance ?? 2))),
      };
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    console.error("Memory classification failed:", lastError);
  }

  return null;
}

async function classifyMemory(messages: Messages): Promise<MemoryCandidate | null> {
  const lastUserMessage = [...messages].reverse().find((message) => message.role === "user");

  if (!lastUserMessage) {
    return null;
  }

  const text = lastUserMessage.content.trim();
  if (!text) {
    return null;
  }

  if (detectObviousNonMemory(text)) {
    return null;
  }

  const ruleCandidate = buildCandidateFromRules(text);
  if (ruleCandidate) {
    return ruleCandidate;
  }

  const llmCandidate = await classifyWithLLM(text);
  if (!llmCandidate) {
    return null;
  }

  return {
    content: llmCandidate.content,
    scope: llmCandidate.scope,
    owner: llmCandidate.owner,
    confidence: llmCandidate.confidence,
    importance: llmCandidate.importance,
  };
}

export async function writeMemoryFromChatTurn(input: {
  userId: number;
  apiKeyId: number;
  messages: Messages;
  assistantOutput: string;
  model: string;
}) {
  const candidate = await classifyMemory(input.messages);

  if (!candidate) {
    return null;
  }

  const resolvedApiKeyId = candidate.owner === "api_key" ? input.apiKeyId : null;

  const existing = await prisma.memory.findFirst({
    where: {
      userId: input.userId,
      apiKeyId: resolvedApiKeyId,
      scope: candidate.scope,
      content: candidate.content,
      archived: false,
    },
    select: {
      id: true,
    },
  });

  if (existing) {
    const updated = await prisma.memory.update({
      where: {
        id: existing.id,
      },
      data: {
        lastUsedAt: new Date(),
        confidence: Math.min(1, candidate.confidence + 0.05),
        importance: Math.min(5, candidate.importance + 1),
      },
    });

    return updated.id;
  }

  const memory = await prisma.memory.create({
    data: {
      userId: input.userId,
      apiKeyId: resolvedApiKeyId,
      scope: candidate.scope,
      content: candidate.content,
      source: `chat:${input.model}`,
      confidence: candidate.confidence,
      importance: candidate.importance,
      lastUsedAt: new Date(),
    },
  });

  return memory.id;
}
