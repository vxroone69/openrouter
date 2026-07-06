import { prisma } from "db";

export type RequestLogStatus = "success" | "error" | "rate_limited";
export type RequestLogErrorType = "timeout" | "provider_5xx" | "invalid_request" | "rate_limit" | "other";

export type RequestLogInput = {
  userId: number;
  apiKeyId: number;
  model: string;
  provider?: string | null;
  status: RequestLogStatus;
  errorType?: RequestLogErrorType | null;
  fallbackUsed: boolean;
  fallbackCount: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
  streaming: boolean;
  latencyMs: number;
  ttftMs?: number | null;
};

export function classifyRequestError(message: string): RequestLogErrorType {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("timeout") ||
    normalized.includes("timed out") ||
    normalized.includes("deadline exceeded")
  ) {
    return "timeout";
  }

  if (
    normalized.includes("429") ||
    normalized.includes("rate limit") ||
    normalized.includes("quota")
  ) {
    return "rate_limit";
  }

  if (
    normalized.includes("400") ||
    normalized.includes("invalid request") ||
    normalized.includes("bad request") ||
    normalized.includes("unsupported") ||
    normalized.includes("no providers mapped") ||
    normalized.includes("invalid api key") ||
    normalized.includes("insufficient credits") ||
    normalized.includes("no provider found") ||
    normalized.includes("no route for that uri") ||
    normalized.includes("not found")
  ) {
    return "invalid_request";
  }

  if (
    normalized.includes("500") ||
    normalized.includes("502") ||
    normalized.includes("503") ||
    normalized.includes("504") ||
    normalized.includes("internal server error") ||
    normalized.includes("unavailable")
  ) {
    return "provider_5xx";
  }

  return "other";
}

export function scheduleRequestLog(input: RequestLogInput) {
  void prisma.requestLog
    .create({
      data: {
        userId: input.userId,
        apiKeyId: input.apiKeyId,
        model: input.model,
        provider: input.provider ?? null,
        status: input.status,
        errorType: input.errorType ?? null,
        fallbackUsed: input.fallbackUsed,
        fallbackCount: input.fallbackCount,
        promptTokens: input.promptTokens,
        completionTokens: input.completionTokens,
        totalTokens: input.totalTokens,
        cost: input.cost,
        streaming: input.streaming,
        latencyMs: input.latencyMs,
        ttftMs: input.ttftMs ?? null,
      },
    })
    .catch((error) => {
      console.error("Failed to persist request log:", error);
    });
}
