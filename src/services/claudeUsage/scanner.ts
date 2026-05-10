import { ClaudeRecord, ScanResult } from "./types";
import { parseJsonlContent, deduplicateRecords, getConfigDirs } from "./parser";
import { calculateRecordCost } from "./pricing";

/**
 * Scan a directory for JSONL session files from Claude Code.
 * Follows the same pattern as codeburn's session scanning.
 */
export async function scanClaudeUsage(
  customPaths?: string[]
): Promise<ScanResult> {
  const startTime = performance.now();
  const allRecords: ClaudeRecord[] = [];
  const errors: string[] = [];
  let scannedFiles = 0;

  const pathsToScan = customPaths && customPaths.length > 0
    ? customPaths
    : getDefaultScanPaths();

  for (const dirPath of pathsToScan) {
    try {
      const entries = await listDir(dirPath);
      for (const entry of entries) {
        if (!entry.endsWith(".jsonl")) continue;
        try {
          const content = await readFile(entry);
          const records = parseJsonlContent(content);
          // Set project from parent directory name
          const projectName = getProjectName(entry, dirPath);
          for (const record of records) {
            record.project = projectName;
            // Calculate cost if not present
            if (!record.cost || record.cost === 0) {
              record.cost = calculateRecordCost(record);
            }
          }
          allRecords.push(...records);
          scannedFiles++;
        } catch (err) {
          errors.push(`Error reading ${entry}: ${err}`);
        }
      }
    } catch (err) {
      errors.push(`Error scanning ${dirPath}: ${err}`);
    }
  }

  const deduped = deduplicateRecords(allRecords);
  const scanTime = performance.now() - startTime;

  return {
    records: deduped,
    errors,
    scannedFiles,
    scanTime,
  };
}

function getDefaultScanPaths(): string[] {
  const paths: string[] = [];

  // Claude Code projects directory
  const configDirs = getConfigDirs();
  for (const configDir of configDirs) {
    paths.push(`${configDir}/projects`);
  }

  return paths;
}

function getProjectName(filePath: string, baseDir: string): string {
  // Remove baseDir prefix and get the first directory component
  const relative = filePath.replace(baseDir, "").replace(/^\/+/, "");
  const parts = relative.split("/");
  if (parts.length > 0) {
    return parts[0];
  }
  return "unknown";
}

async function listDir(dirPath: string): Promise<string[]> {
  // In a browser/web context, this won't work directly
  // For Tauri, we'll use the invoke API
  // For testing, return empty
  if (typeof window !== "undefined" && "fs" in window) {
    try {
      // Use Tauri fs plugin
      const { readDir } = await import("@tauri-apps/plugin-fs");
      const entries = await readDir(dirPath);
      return entries.map((e: { name: string }) => e.name).filter(Boolean);
    } catch {
      return [];
    }
  }
  return [];
}

async function readFile(filePath: string): Promise<string> {
  if (typeof window !== "undefined" && "fs" in window) {
    try {
      const { readTextFile } = await import("@tauri-apps/plugin-fs");
      return await readTextFile(filePath);
    } catch {
      return "";
    }
  }
  return "";
}

/**
 * Scan Claude usage by directly reading JSONL files (for testing / mock mode).
 */
export function scanClaudeUsageSync(content: string): ClaudeRecord[] {
  return parseJsonlContent(content);
}
