import { DownloadTask } from "../services/modelDownload/types";

export interface DownloadHistoryData {
  tasks: DownloadTask[];
  updatedAt: string;
}

function getHistoryPath(): string {
  return "cmtool-download-history.json";
}

export async function loadDownloadHistory(): Promise<DownloadHistoryData> {
  try {
    const stored = localStorage.getItem(getHistoryPath());
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // File not found or parse error
  }
  return { tasks: [], updatedAt: new Date().toISOString() };
}

export async function saveDownloadHistory(
  data: DownloadHistoryData
): Promise<void> {
  try {
    localStorage.setItem(getHistoryPath(), JSON.stringify(data));
  } catch {
    // Silently fail
  }
}

export async function clearDownloadHistory(): Promise<void> {
  try {
    localStorage.removeItem(getHistoryPath());
  } catch {
    // Silently fail
  }
}
