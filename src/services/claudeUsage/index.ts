import { ClaudeRecord, UsageStats, ModelStat, ProjectStat, DateStat } from "./types";
import { calculateRecordCost, getShortModelName } from "./pricing";

export type { ClaudeRecord, UsageStats, ScanResult } from "./types";
export { scanClaudeUsage } from "./scanner";
export { parseJsonlContent, parseJsonlLine, deduplicateRecords } from "./parser";
export { getModelPrice, calculateRecordCost, getShortModelName } from "./pricing";

/**
 * Aggregate records into usage statistics.
 */
export function aggregateUsage(records: ClaudeRecord[]): UsageStats {
  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];

  // Calculate date range for last 7 and 30 days
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  let todayInputTokens = 0;
  let todayOutputTokens = 0;
  let todayTotalTokens = 0;
  let todayCost = 0;
  let todayRequests = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalTotalTokens = 0;
  let totalCost = 0;
  let totalRequests = 0;

  const modelMap = new Map<string, ModelStat>();
  const projectMap = new Map<string, ProjectStat>();
  const dateMap = new Map<string, DateStat>();
  const recentRecords: ClaudeRecord[] = [];

  for (const record of records) {
    const cost = record.cost ?? calculateRecordCost(record);
    const inputTokens = record.input_tokens ?? 0;
    const outputTokens = record.output_tokens ?? 0;
    const totalTokens = record.total_tokens ?? inputTokens + outputTokens;

    totalInputTokens += inputTokens;
    totalOutputTokens += outputTokens;
    totalTotalTokens += totalTokens;
    totalCost += cost;
    totalRequests++;

    // Today
    const recordDate = record.timestamp
      ? record.timestamp.split("T")[0]
      : "";
    if (recordDate === todayStr) {
      todayInputTokens += inputTokens;
      todayOutputTokens += outputTokens;
      todayTotalTokens += totalTokens;
      todayCost += cost;
      todayRequests++;
    }

    // By model
    const shortModel = getShortModelName(record.model);
    const existingModel = modelMap.get(shortModel) || {
      model: shortModel,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      cost: 0,
      requests: 0,
    };
    existingModel.inputTokens += inputTokens;
    existingModel.outputTokens += outputTokens;
    existingModel.totalTokens += totalTokens;
    existingModel.cost += cost;
    existingModel.requests++;
    modelMap.set(shortModel, existingModel);

    // By project
    const projectName = record.project || "unknown";
    const existingProj = projectMap.get(projectName) || {
      project: projectName,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      cost: 0,
      requests: 0,
    };
    existingProj.inputTokens += inputTokens;
    existingProj.outputTokens += outputTokens;
    existingProj.totalTokens += totalTokens;
    existingProj.cost += cost;
    existingProj.requests++;
    projectMap.set(projectName, existingProj);

    // By date
    if (recordDate) {
      const existingDate = dateMap.get(recordDate) || {
        date: recordDate,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        cost: 0,
        requests: 0,
      };
      existingDate.inputTokens += inputTokens;
      existingDate.outputTokens += outputTokens;
      existingDate.totalTokens += totalTokens;
      existingDate.cost += cost;
      existingDate.requests++;
      dateMap.set(recordDate, existingDate);
    }

    // Recent records (last 100)
    if (recentRecords.length < 100) {
      recentRecords.push(record);
    }
  }

  // Sort by model cost descending, project cost descending, date ascending
  const byModel = Array.from(modelMap.values()).sort(
    (a, b) => b.cost - a.cost
  );
  const byProject = Array.from(projectMap.values()).sort(
    (a, b) => b.cost - a.cost
  );
  const byDate = Array.from(dateMap.values()).sort(
    (a, b) => a.date.localeCompare(b.date)
  );

  return {
    todayInputTokens,
    todayOutputTokens,
    todayTotalTokens,
    todayCost,
    todayRequests,
    totalInputTokens,
    totalOutputTokens,
    totalTotalTokens,
    totalCost,
    totalRequests,
    byModel,
    byProject,
    byDate,
    recentRecords,
  };
}
