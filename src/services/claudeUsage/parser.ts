import { ClaudeRecord } from "./types";

function getEnvClaudeDirs(): string[] {
  if (typeof process === "undefined") return [];
  const multi = process.env["CLAUDE_CONFIG_DIRS"];
  if (multi) {
    return multi
      .split(":")  // POSIX path delimiter
      .map((s: string) => s.trim())
      .filter((s: string) => s.length > 0);
  }
  const single = process.env["CLAUDE_CONFIG_DIR"];
  if (single) return [single];
  return [];
}

const CLAUDE_CONFIG_DIRS = [
  ...getEnvClaudeDirs(),
];

/**
 * Parse a single JSONL line into a ClaudeRecord.
 * Handles missing fields gracefully - never throws.
 */
export function parseJsonlLine(line: string): ClaudeRecord | null {
  try {
    const data = JSON.parse(line);

    // Skip non-assistant messages (user messages don't have usage data)
    if (data.type !== "assistant") return null;

    const message = data.message;
    if (!message || !message.usage) return null;

    const usage = message.usage;
    const model = message.model || "";

    if (!model) return null;

    const inputTokens = usage.input_tokens ?? 0;
    const outputTokens = usage.output_tokens ?? 0;
    const totalTokens =
      usage.total_tokens ?? inputTokens + outputTokens;

    return {
      timestamp: data.timestamp || "",
      model,
      project: "",
      cwd: data.cwd || "",
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
      total_tokens: totalTokens,
      request_id: message.id || "",
      session_id: data.sessionId || "",
    };
  } catch {
    return null;
  }
}

/**
 * Parse multiple lines from a JSONL file into records.
 */
export function parseJsonlContent(content: string): ClaudeRecord[] {
  const records: ClaudeRecord[] = [];
  const lines = content.split("\n");

  for (const line of lines) {
    if (!line.trim()) continue;
    const record = parseJsonlLine(line);
    if (record) {
      records.push(record);
    }
  }

  return records;
}

/**
 * Deduplicate streaming message IDs.
 * When Claude streams responses, the same message ID appears multiple times.
 * Keep only the first and last occurrence.
 */
export function deduplicateRecords(
  records: ClaudeRecord[]
): ClaudeRecord[] {
  const seenRequestIds = new Set<string>();
  const lastIdxByRequestId = new Map<string, number>();

  // First pass: find last index for each request_id
  for (let i = 0; i < records.length; i++) {
    const rid = records[i].request_id;
    if (rid) {
      lastIdxByRequestId.set(rid, i);
    }
  }

  // Second pass: keep records with no request_id, or only the last occurrence
  return records.filter((record, index) => {
    if (!record.request_id) return true;
    // Only keep the last occurrence (it has the final/complete usage data)
    const isLast = lastIdxByRequestId.get(record.request_id) === index;
    if (isLast) {
      seenRequestIds.add(record.request_id);
      return true;
    }
    return false;
  });
}

export function getConfigDirs(): string[] {
  return CLAUDE_CONFIG_DIRS;
}
