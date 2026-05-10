import { describe, it, expect } from "vitest";
import { parseJsonlLine, parseJsonlContent, deduplicateRecords } from "../src/services/claudeUsage/parser";
import { aggregateUsage } from "../src/services/claudeUsage";
import { calculateRecordCost, getModelPrice, getShortModelName } from "../src/services/claudeUsage/pricing";
import { ClaudeRecord } from "../src/services/claudeUsage/types";

describe("Claude Usage - Parse Records", () => {
  it("should parse a valid JSONL line", () => {
    const line = JSON.stringify({
      type: "assistant",
      timestamp: "2025-01-15T10:30:00Z",
      sessionId: "sess-001",
      cwd: "/projects/test",
      message: {
        model: "claude-sonnet-4-6",
        id: "msg-001",
        usage: {
          input_tokens: 150,
          output_tokens: 300,
          cache_creation_input_tokens: 50,
          cache_read_input_tokens: 20,
        },
      },
    });

    const record = parseJsonlLine(line);
    expect(record).not.toBeNull();
    expect(record!.model).toBe("claude-sonnet-4-6");
    expect(record!.input_tokens).toBe(150);
    expect(record!.output_tokens).toBe(300);
    expect(record!.cache_creation_input_tokens).toBe(50);
    expect(record!.cache_read_input_tokens).toBe(20);
    expect(record!.session_id).toBe("sess-001");
  });

  it("should skip user messages", () => {
    const line = JSON.stringify({
      type: "user",
      message: { role: "user", content: "hello" },
    });

    const record = parseJsonlLine(line);
    expect(record).toBeNull();
  });

  it("should handle missing fields gracefully", () => {
    const line = JSON.stringify({
      type: "assistant",
      message: {
        model: "claude-sonnet-4-6",
        usage: {},
      },
    });

    const record = parseJsonlLine(line);
    expect(record).not.toBeNull();
    expect(record!.input_tokens).toBe(0);
    expect(record!.output_tokens).toBe(0);
    expect(record!.cache_creation_input_tokens).toBe(0);
    expect(record!.cache_read_input_tokens).toBe(0);
  });

  it("should handle invalid JSON gracefully", () => {
    const record = parseJsonlLine("not-json-at-all");
    expect(record).toBeNull();
  });

  it("should handle empty line", () => {
    const record = parseJsonlLine("");
    expect(record).toBeNull();
  });

  it("should handle missing model name", () => {
    const line = JSON.stringify({
      type: "assistant",
      message: { usage: { input_tokens: 100 } },
    });

    const record = parseJsonlLine(line);
    expect(record).toBeNull();
  });
});

describe("Claude Usage - Parse JSONL Content", () => {
  it("should parse a multi-line JSONL content", () => {
    const content = [
      JSON.stringify({ type: "assistant", message: { model: "claude-sonnet-4-6", usage: { input_tokens: 100, output_tokens: 200 } }, sessionId: "s1" }),
      JSON.stringify({ type: "assistant", message: { model: "claude-opus-4-6", usage: { input_tokens: 50, output_tokens: 150 } }, sessionId: "s1" }),
      JSON.stringify({ type: "user", message: { role: "user", content: "hi" } }),
    ].join("\n");

    const records = parseJsonlContent(content);
    expect(records).toHaveLength(2);
    expect(records[0].model).toBe("claude-sonnet-4-6");
    expect(records[1].model).toBe("claude-opus-4-6");
  });

  it("should handle empty content", () => {
    const records = parseJsonlContent("");
    expect(records).toHaveLength(0);
  });

  it("should handle content with only invalid lines", () => {
    const content = ["not-json", "", "also-not-json"].join("\n");
    const records = parseJsonlContent(content);
    expect(records).toHaveLength(0);
  });
});

describe("Claude Usage - Deduplicate", () => {
  it("should deduplicate streaming messages with same request_id", () => {
    const records: ClaudeRecord[] = [
      { timestamp: "2025-01-15T10:30:00Z", model: "claude-sonnet-4-6", project: "test", input_tokens: 100, output_tokens: 200, request_id: "msg-1", session_id: "s1" },
      { timestamp: "2025-01-15T10:30:01Z", model: "claude-sonnet-4-6", project: "test", input_tokens: 100, output_tokens: 300, request_id: "msg-1", session_id: "s1" },
    ];

    const deduped = deduplicateRecords(records);
    expect(deduped).toHaveLength(1);
    // Should keep the last occurrence (with final output_tokens)
    expect(deduped[0].output_tokens).toBe(300);
  });

  it("should keep records without request_id", () => {
    const records: ClaudeRecord[] = [
      { timestamp: "2025-01-15T10:30:00Z", model: "claude-sonnet-4-6", project: "test", input_tokens: 100, output_tokens: 200, session_id: "s1" },
      { timestamp: "2025-01-15T10:31:00Z", model: "claude-opus-4-6", project: "test", input_tokens: 50, output_tokens: 100, session_id: "s2" },
    ];

    const deduped = deduplicateRecords(records);
    expect(deduped).toHaveLength(2);
  });
});

describe("Claude Usage - Pricing", () => {
  it("should return pricing for known models", () => {
    const pricing = getModelPrice("claude-sonnet-4-6");
    expect(pricing).not.toBeNull();
    expect(pricing!.inputCostPerToken).toBeGreaterThan(0);
    expect(pricing!.outputCostPerToken).toBeGreaterThan(0);
  });

  it("should return null for unknown models", () => {
    const pricing = getModelPrice("unknown-model-12345");
    expect(pricing).toBeNull();
  });

  it("should calculate cost correctly", () => {
    const record: ClaudeRecord = {
      timestamp: "2025-01-15T10:30:00Z",
      model: "claude-sonnet-4-6",
      project: "test",
      input_tokens: 1000,
      output_tokens: 2000,
    };

    const cost = calculateRecordCost(record);
    expect(cost).toBeGreaterThan(0);
    // 1000 * $3/M + 2000 * $15/M = $0.003 + $0.03 = $0.033
    expect(cost).toBeCloseTo(0.033, 4);
  });

  it("should handle aliased model names", () => {
    const pricing = getModelPrice("claude-sonnet-4.6");
    expect(pricing).not.toBeNull();
    expect(pricing!.inputCostPerToken).toBe(3 / 1_000_000);
  });

  it("should handle provider-prefixed model names", () => {
    const pricing = getModelPrice("anthropic/claude-sonnet-4-6");
    expect(pricing).not.toBeNull();
  });

  it("should calculate zero cost for models without pricing", () => {
    const record: ClaudeRecord = {
      timestamp: "2025-01-15T10:30:00Z",
      model: "unknown-model",
      project: "test",
      input_tokens: 1000,
      output_tokens: 1000,
    };

    const cost = calculateRecordCost(record);
    expect(cost).toBe(0);
  });
});

describe("Claude Usage - Aggregation", () => {
  it("should aggregate records correctly", () => {
    const records: ClaudeRecord[] = [
      { timestamp: "2025-01-15T10:00:00Z", model: "claude-sonnet-4-6", project: "project-a", input_tokens: 1000, output_tokens: 2000 },
      { timestamp: "2025-01-15T11:00:00Z", model: "claude-opus-4-6", project: "project-a", input_tokens: 500, output_tokens: 1000 },
      { timestamp: "2025-01-16T10:00:00Z", model: "claude-sonnet-4-6", project: "project-b", input_tokens: 200, output_tokens: 400 },
    ];

    const stats = aggregateUsage(records);
    expect(stats.totalRequests).toBe(3);
    expect(stats.totalInputTokens).toBe(1700);
    expect(stats.totalOutputTokens).toBe(3400);
    expect(stats.totalCost).toBeGreaterThan(0);
  });

  it("should handle empty records", () => {
    const stats = aggregateUsage([]);
    expect(stats.totalRequests).toBe(0);
    expect(stats.totalInputTokens).toBe(0);
    expect(stats.totalOutputTokens).toBe(0);
    expect(stats.totalCost).toBe(0);
    expect(stats.byModel).toHaveLength(0);
    expect(stats.byProject).toHaveLength(0);
    expect(stats.byDate).toHaveLength(0);
    expect(stats.recentRecords).toHaveLength(0);
  });

  it("should aggregate by model", () => {
    const records: ClaudeRecord[] = [
      { timestamp: "2025-01-15T10:00:00Z", model: "claude-sonnet-4-6", project: "p1", input_tokens: 100, output_tokens: 200 },
      { timestamp: "2025-01-15T11:00:00Z", model: "claude-sonnet-4-6", project: "p1", input_tokens: 300, output_tokens: 400 },
      { timestamp: "2025-01-15T12:00:00Z", model: "claude-opus-4-6", project: "p1", input_tokens: 500, output_tokens: 600 },
    ];

    const stats = aggregateUsage(records);
    expect(stats.byModel).toHaveLength(2);

    const sonnet = stats.byModel.find((m) => m.model === "Sonnet 4.6");
    expect(sonnet).toBeDefined();
    expect(sonnet!.requests).toBe(2);
    expect(sonnet!.inputTokens).toBe(400);
    expect(sonnet!.outputTokens).toBe(600);
  });

  it("should aggregate by project", () => {
    const records: ClaudeRecord[] = [
      { timestamp: "2025-01-15T10:00:00Z", model: "claude-sonnet-4-6", project: "project-alpha", input_tokens: 100, output_tokens: 200 },
      { timestamp: "2025-01-15T11:00:00Z", model: "claude-sonnet-4-6", project: "project-beta", input_tokens: 300, output_tokens: 400 },
    ];

    const stats = aggregateUsage(records);
    expect(stats.byProject).toHaveLength(2);
  });

  it("should aggregate by date", () => {
    const records: ClaudeRecord[] = [
      { timestamp: "2025-01-15T10:00:00Z", model: "claude-sonnet-4-6", project: "p1", input_tokens: 100, output_tokens: 200 },
      { timestamp: "2025-01-16T10:00:00Z", model: "claude-sonnet-4-6", project: "p1", input_tokens: 300, output_tokens: 400 },
    ];

    const stats = aggregateUsage(records);
    expect(stats.byDate).toHaveLength(2);
  });

  it("should handle records with missing token fields", () => {
    const records: ClaudeRecord[] = [
      { timestamp: "2025-01-15T10:00:00Z", model: "claude-sonnet-4-6", project: "p1" },
    ];

    const stats = aggregateUsage(records);
    expect(stats.totalRequests).toBe(1);
    expect(stats.totalInputTokens).toBe(0);
    expect(stats.totalOutputTokens).toBe(0);
  });

  it("should handle records with duplicate session IDs", () => {
    const records: ClaudeRecord[] = [
      { timestamp: "2025-01-15T10:00:00Z", model: "claude-sonnet-4-6", project: "p1", input_tokens: 100, output_tokens: 200, session_id: "dup-session" },
      { timestamp: "2025-01-15T10:01:00Z", model: "claude-sonnet-4-6", project: "p1", input_tokens: 100, output_tokens: 200, session_id: "dup-session" },
    ];

    // Both are valid records from the same session, should be counted
    const stats = aggregateUsage(records);
    expect(stats.totalRequests).toBe(2);
  });
});

describe("Claude Usage - Model Names", () => {
  it("should return short names for known models", () => {
    expect(getShortModelName("claude-sonnet-4-6")).toBe("Sonnet 4.6");
    expect(getShortModelName("claude-opus-4-6")).toBe("Opus 4.6");
    expect(getShortModelName("claude-3-5-sonnet")).toBe("Sonnet 3.5");
    expect(getShortModelName("claude-haiku-4-5")).toBe("Haiku 4.5");
  });

  it("should return original for unknown models", () => {
    expect(getShortModelName("some-random-model")).toBe("some-random-model");
  });
});
