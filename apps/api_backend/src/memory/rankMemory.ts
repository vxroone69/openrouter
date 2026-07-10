import type { RetrievedMemory } from "./retrieveMemory";

export type MemoryRankingFactors = {
  semanticSimilarity: number;
  recencyBoost: number;
  confidence: number;
  importance: number;
  compressionBonus: number;
};

export type RankedMemory = RetrievedMemory & {
  relevanceScore: number;
  factors: MemoryRankingFactors;
  estimatedTokens: number;
  willInject: boolean;
  notInjectedReason?: string;
};

export type RankMemoryOptions = {
  maxMemoryTokens?: number;
  now?: Date;
};

const DEFAULT_MAX_MEMORY_TOKENS = 500;

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function estimateTokens(text: string) {
  return Math.max(1, Math.ceil(text.length / 4));
}

function calculateRecencyBoost(lastUsedAt: Date | null, createdAt: Date, now: Date) {
  const anchor = lastUsedAt ?? createdAt;
  const ageHours = Math.max(0, now.getTime() - anchor.getTime()) / 3_600_000;

  if (ageHours <= 24) {
    return 1;
  }

  return clamp01(1 / (1 + ageHours / 168));
}

export function rankAndSelectMemories(
  memories: RetrievedMemory[],
  options: RankMemoryOptions = {}
): RankedMemory[] {
  const now = options.now ?? new Date();
  const tokenBudget = options.maxMemoryTokens ?? DEFAULT_MAX_MEMORY_TOKENS;

  const ranked = memories
    .map((memory) => {
      const semanticSimilarity = clamp01(memory.semanticSimilarity ?? 0);
      const recencyBoost = calculateRecencyBoost(memory.lastUsedAt, memory.createdAt, now);
      const confidence = clamp01(memory.confidence);
      const importance = clamp01(memory.importance);
      const compressionBonus = memory.isCompressed ? 0.05 : 0;

      /*
       * YOUR LANE:
       * Tune this scoring formula. The defaults are intentionally simple:
       * semantic relevance matters most, then recency, then trust/importance.
       */
      const relevanceScore =
        0.6 * semanticSimilarity +
        0.2 * recencyBoost +
        0.1 * confidence +
        0.1 * importance +
        compressionBonus;

      return {
        ...memory,
        relevanceScore,
        factors: {
          semanticSimilarity,
          recencyBoost,
          confidence,
          importance,
          compressionBonus,
        },
        estimatedTokens: estimateTokens(memory.content),
        willInject: false,
      };
    })
    .sort((left, right) => right.relevanceScore - left.relevanceScore);

  let usedTokens = 0;

  return ranked.map((memory) => {
    if (usedTokens + memory.estimatedTokens <= tokenBudget) {
      usedTokens += memory.estimatedTokens;
      return {
        ...memory,
        willInject: true,
      };
    }

    return {
      ...memory,
      notInjectedReason: "Memory token budget exceeded",
    };
  });
}
