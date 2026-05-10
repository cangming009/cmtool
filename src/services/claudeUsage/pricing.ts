import { ClaudeRecord } from "./types";

export interface ModelPrice {
  inputCostPerToken: number;
  outputCostPerToken: number;
  cacheWriteCostPerToken: number;
  cacheReadCostPerToken: number;
}

const PRICING_TABLE: Record<string, ModelPrice> = {
  "claude-opus-4-7": {
    inputCostPerToken: 15 / 1_000_000,
    outputCostPerToken: 60 / 1_000_000,
    cacheWriteCostPerToken: 18.75 / 1_000_000,
    cacheReadCostPerToken: 1.5 / 1_000_000,
  },
  "claude-opus-4-6": {
    inputCostPerToken: 15 / 1_000_000,
    outputCostPerToken: 60 / 1_000_000,
    cacheWriteCostPerToken: 18.75 / 1_000_000,
    cacheReadCostPerToken: 1.5 / 1_000_000,
  },
  "claude-opus-4-5": {
    inputCostPerToken: 15 / 1_000_000,
    outputCostPerToken: 75 / 1_000_000,
    cacheWriteCostPerToken: 18.75 / 1_000_000,
    cacheReadCostPerToken: 1.5 / 1_000_000,
  },
  "claude-sonnet-4-6": {
    inputCostPerToken: 3 / 1_000_000,
    outputCostPerToken: 15 / 1_000_000,
    cacheWriteCostPerToken: 3.75 / 1_000_000,
    cacheReadCostPerToken: 0.3 / 1_000_000,
  },
  "claude-sonnet-4-5": {
    inputCostPerToken: 3 / 1_000_000,
    outputCostPerToken: 15 / 1_000_000,
    cacheWriteCostPerToken: 3.75 / 1_000_000,
    cacheReadCostPerToken: 0.3 / 1_000_000,
  },
  "claude-sonnet-4": {
    inputCostPerToken: 3 / 1_000_000,
    outputCostPerToken: 15 / 1_000_000,
    cacheWriteCostPerToken: 3.75 / 1_000_000,
    cacheReadCostPerToken: 0.3 / 1_000_000,
  },
  "claude-3-5-sonnet": {
    inputCostPerToken: 3 / 1_000_000,
    outputCostPerToken: 15 / 1_000_000,
    cacheWriteCostPerToken: 4.5 / 1_000_000,
    cacheReadCostPerToken: 0.3 / 1_000_000,
  },
  "claude-haiku-4-5": {
    inputCostPerToken: 0.8 / 1_000_000,
    outputCostPerToken: 4 / 1_000_000,
    cacheWriteCostPerToken: 1 / 1_000_000,
    cacheReadCostPerToken: 0.08 / 1_000_000,
  },
  "claude-3-5-haiku": {
    inputCostPerToken: 0.8 / 1_000_000,
    outputCostPerToken: 4 / 1_000_000,
    cacheWriteCostPerToken: 1 / 1_000_000,
    cacheReadCostPerToken: 0.08 / 1_000_000,
  },
  "gpt-4o": {
    inputCostPerToken: 2.5 / 1_000_000,
    outputCostPerToken: 10 / 1_000_000,
    cacheWriteCostPerToken: 3.75 / 1_000_000,
    cacheReadCostPerToken: 0.3 / 1_000_000,
  },
};

const MODEL_ALIASES: Record<string, string> = {
  "claude-sonnet-4.6": "claude-sonnet-4-6",
  "claude-sonnet-4.5": "claude-sonnet-4-5",
  "claude-opus-4.6": "claude-opus-4-6",
  "claude-opus-4.5": "claude-opus-4-5",
  "claude-opus-4.7": "claude-opus-4-7",
};

export function getModelPrice(model: string): ModelPrice | null {
  // Check exact match first
  if (PRICING_TABLE[model]) return PRICING_TABLE[model];

  // Check alias
  const alias = MODEL_ALIASES[model];
  if (alias && PRICING_TABLE[alias]) return PRICING_TABLE[alias];

  // Try canonicalize: strip @date and provider prefix
  const canonical = model
    .replace(/@.*$/, "")
    .replace(/-\d{8}$/, "")
    .replace(/^[^/]+\//, "");

  if (PRICING_TABLE[canonical]) return PRICING_TABLE[canonical];
  if (MODEL_ALIASES[canonical] && PRICING_TABLE[MODEL_ALIASES[canonical]])
    return PRICING_TABLE[MODEL_ALIASES[canonical]];

  // Fuzzy match: longest prefix match
  const keys = Object.keys(PRICING_TABLE).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (canonical.startsWith(key + "-") || canonical === key) {
      return PRICING_TABLE[key];
    }
  }

  return null;
}

export function calculateRecordCost(record: ClaudeRecord): number {
  const pricing = getModelPrice(record.model);
  if (!pricing) return 0;

  const inputTokens = record.input_tokens ?? 0;
  const outputTokens = record.output_tokens ?? 0;
  const cacheCreationTokens = record.cache_creation_input_tokens ?? 0;
  const cacheReadTokens = record.cache_read_input_tokens ?? 0;

  return (
    inputTokens * pricing.inputCostPerToken +
    outputTokens * pricing.outputCostPerToken +
    cacheCreationTokens * pricing.cacheWriteCostPerToken +
    cacheReadTokens * pricing.cacheReadCostPerToken
  );
}

export function getShortModelName(model: string): string {
  const shortNames: Record<string, string> = {
    "claude-opus-4-7": "Opus 4.7",
    "claude-opus-4-6": "Opus 4.6",
    "claude-opus-4-5": "Opus 4.5",
    "claude-sonnet-4-6": "Sonnet 4.6",
    "claude-sonnet-4-5": "Sonnet 4.5",
    "claude-sonnet-4": "Sonnet 4",
    "claude-3-5-sonnet": "Sonnet 3.5",
    "claude-haiku-4-5": "Haiku 4.5",
    "claude-3-5-haiku": "Haiku 3.5",
  };

  const canonical = model.replace(/@.*$/, "").replace(/-\d{8}$/, "");
  for (const [key, name] of Object.entries(shortNames)) {
    if (canonical.startsWith(key)) return name;
  }
  return canonical;
}
