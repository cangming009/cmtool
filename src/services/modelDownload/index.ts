import { DownloadSource, DownloadStatus, DownloadTask, SearchResult, ModelInfo, LocalModel } from "./types";
import { BaseDownloader } from "./downloader";
import { ModelScopeDownloader } from "./modelscope";
import { HuggingFaceDownloader } from "./huggingface";
import { saveDownloadHistory, loadDownloadHistory } from "../../storage/history";
import { getConfig, updateConfig } from "../../storage/config";

export type { DownloadSource, DownloadStatus, DownloadTask } from "./types";

class DownloadManager {
  private downloaders: Map<DownloadSource, BaseDownloader> = new Map();
  private tasks: Map<string, DownloadTask> = new Map();
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.downloaders.set(
      "ModelScope",
      new ModelScopeDownloader(
        this.handleProgress.bind(this),
        this.handleStatusChange.bind(this)
      )
    );
    this.downloaders.set(
      "HuggingFace",
      new HuggingFaceDownloader(
        this.handleProgress.bind(this),
        this.handleStatusChange.bind(this)
      )
    );
  }

  // ── Search ────────────────────────────────────────────────────────

  async searchModels(query: string, source: DownloadSource = "All", limit = 50): Promise<SearchResult[]> {
    const results: SearchResult[] = [];

    if (source === "HuggingFace" || source === "All") {
      try {
        const hfResults = await HuggingFaceDownloader.searchModels(query, limit);
        results.push(...hfResults);
      } catch {
        // Ignore individual source errors
      }
    }

    if (source === "ModelScope" || source === "All") {
      try {
        const msResults = await ModelScopeDownloader.searchModels(query, limit);
        results.push(...msResults);
      } catch {
        // Ignore individual source errors
      }
    }

    // Sort by downloads descending
    results.sort((a, b) => b.downloads - a.downloads);
    return results.slice(0, limit);
  }

  async getModelInfo(repoId: string, source: DownloadSource): Promise<ModelInfo | null> {
    if (source === "HuggingFace") {
      return HuggingFaceDownloader.getModelInfo(repoId);
    }
    if (source === "ModelScope") {
      return ModelScopeDownloader.getModelInfo(repoId);
    }
    // For "All", try HuggingFace first since it's more common
    const info = await HuggingFaceDownloader.getModelInfo(repoId);
    if (info) return info;
    return ModelScopeDownloader.getModelInfo(repoId);
  }

  // ── Local Model Scanning ──────────────────────────────────────────

  async scanLocalModels(downloadDir?: string): Promise<LocalModel[]> {
    const dir = downloadDir || this.getDefaultDownloadDir();
    const localModels: LocalModel[] = [];

    try {
      const { readDir } = await import("@tauri-apps/plugin-fs");
      const entries = await readDir(dir);
      for (const entry of entries) {
        if (entry.isDirectory) {
          const entryPath = dir + "/" + entry.name;
          const info = await this._scanDir(entryPath);
          localModels.push({
            name: entry.name || "unknown",
            path: entryPath,
            size: info.size,
            size_formatted: this._formatBytes(info.size),
            fileCount: info.fileCount,
            lastModified: info.lastModified,
            verified: false,
          });
        }
      }
    } catch {
      // FS plugin not available, return empty
    }

    return localModels.sort((a, b) => b.lastModified.localeCompare(a.lastModified));
  }

  private async _scanDir(
    dirPath: string
  ): Promise<{ size: number; fileCount: number; lastModified: string }> {
    let totalSize = 0;
    let totalCount = 0;
    let latestMtime = "";

    try {
      const { readDir, stat } = await import("@tauri-apps/plugin-fs");
      const entries = await readDir(dirPath);

      for (const entry of entries) {
        const fullPath = dirPath + "/" + entry.name;
        if (entry.isDirectory) {
          const sub = await this._scanDir(fullPath);
          totalSize += sub.size;
          totalCount += sub.fileCount;
          if (sub.lastModified > latestMtime) latestMtime = sub.lastModified;
        } else if (entry.isFile) {
          totalCount++;
          try {
            const fileStat = await stat(fullPath);
            totalSize += fileStat.size || 0;
            const mtime = fileStat.mtime ? new Date(fileStat.mtime).toISOString() : "";
            if (mtime > latestMtime) latestMtime = mtime;
          } catch {
            // Skip unreadable files
          }
        }
      }
    } catch {
      // Ignore unreadable directories
    }

    return { size: totalSize, fileCount: totalCount, lastModified: latestMtime };
  }

  // ── File Verification ─────────────────────────────────────────────

  async verifyModelFiles(modelPath: string): Promise<{ verified: boolean; totalFiles: number; validFiles: number; errors: string[] }> {
    const errors: string[] = [];
    let totalFiles = 0;
    let validFiles = 0;

    try {
      const { readDir, stat } = await import("@tauri-apps/plugin-fs");
      const entries = await readDir(modelPath);

      for (const entry of entries) {
        const fullPath = modelPath + "/" + entry.name;
        if (entry.isFile) {
          totalFiles++;
          try {
            const fileStat = await stat(fullPath);
            if (fileStat.size !== undefined && fileStat.size > 0) {
              validFiles++;
            } else {
              errors.push(`Empty file: ${entry.name}`);
            }
          } catch {
            errors.push(`Cannot read file: ${entry.name}`);
          }
        }
      }
    } catch {
      errors.push(`Cannot access directory: ${modelPath}`);
    }

    return {
      verified: errors.length === 0 && totalFiles > 0,
      totalFiles,
      validFiles,
      errors,
    };
  }

  // ── Directory Management ──────────────────────────────────────────

  async openDownloadDirectory(dirPath?: string): Promise<void> {
    const dir = dirPath || this.getDefaultDownloadDir();
    try {
      const { Command } = await import("@tauri-apps/plugin-shell");
      if (process.platform === "darwin") {
        await Command.create("open", [dir]).execute();
      } else if (process.platform === "win32") {
        await Command.create("explorer", [dir]).execute();
      } else {
        await Command.create("xdg-open", [dir]).execute();
      }
    } catch {
      throw new Error("Cannot open directory. Tauri shell plugin may not be available.");
    }
  }

  updateDefaultDownloadDir(dir: string): void {
    updateConfig({ defaultDownloadDir: dir });
  }

  // ── Progress & Status ─────────────────────────────────────────────

  private handleProgress(
    taskId: string,
    downloaded: number,
    total: number,
    speed: number
  ): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.downloadedSize = downloaded;
      task.totalSize = total;
      task.downloadSpeed = speed;
      if (total > 0) {
        task.progress = Math.min(Math.round((downloaded / total) * 100), 100);
      }
      this.notifyListeners();
      this.saveHistory();
    }
  }

  private handleStatusChange(
    taskId: string,
    status: DownloadStatus,
    error?: string
  ): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = status;
      if (error) task.error = error;
      if (status === "completed") {
        task.completedAt = new Date().toISOString();
        task.progress = 100;
      }
      this.notifyListeners();
      this.saveHistory();
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  getDownloader(source: DownloadSource): BaseDownloader | undefined {
    return this.downloaders.get(source);
  }

  // ── Download Operations ───────────────────────────────────────────

  async startDownload(
    repoId: string,
    source: DownloadSource,
    downloadDir: string
  ): Promise<DownloadTask> {
    if (source === "All") {
      throw new Error("Cannot download from 'All' source. Please select ModelScope or HuggingFace.");
    }

    const downloader = this.downloaders.get(source);
    if (!downloader) {
      throw new Error(`Unsupported download source: ${source}`);
    }

    if (!downloader.validateRepoId(repoId)) {
      throw new Error(
        `Invalid model ID: '${repoId}'. Expected format: 'owner/model' (e.g., 'Qwen/Qwen3-Coder-30B-A3B-Instruct')`
      );
    }

    const taskId = crypto.randomUUID();
    const task: DownloadTask = {
      taskId,
      repoId,
      source,
      status: "waiting",
      progress: 0,
      totalSize: 0,
      downloadedSize: 0,
      downloadSpeed: 0,
      error: "",
      createdAt: new Date().toISOString(),
      retryCount: 0,
      downloadDir,
    };

    this.tasks.set(taskId, task);
    this.notifyListeners();
    this.saveHistory();

    // Start the actual download
    downloader.startDownload(repoId, downloadDir, taskId).catch((err) => {
      task.status = "failed";
      task.error = err instanceof Error ? err.message : String(err);
      this.notifyListeners();
      this.saveHistory();
    });

    return task;
  }

  cancelDownload(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    const downloader = this.downloaders.get(task.source);
    if (!downloader) return false;

    const result = downloader.cancelDownload(taskId);
    if (result) {
      task.status = "cancelled";
      this.notifyListeners();
      this.saveHistory();
    }
    return result;
  }

  async retryDownload(taskId: string): Promise<DownloadTask | null> {
    const task = this.tasks.get(taskId);
    if (!task) return null;

    if (task.status !== "failed" && task.status !== "cancelled") {
      return null;
    }

    const newTask = await this.startDownload(task.repoId, task.source, task.downloadDir);
    newTask.retryCount = (task.retryCount || 0) + 1;
    return newTask;
  }

  // ── Task Management ───────────────────────────────────────────────

  getTask(taskId: string): DownloadTask | undefined {
    return this.tasks.get(taskId);
  }

  getAllTasks(): DownloadTask[] {
    return Array.from(this.tasks.values());
  }

  getDefaultDownloadDir(): string {
    const config = getConfig();
    return config.defaultDownloadDir || "~/cmtool/models";
  }

  async loadHistory(): Promise<void> {
    try {
      const history = await loadDownloadHistory();
      for (const task of history.tasks) {
        if (task.status !== "downloading" && task.status !== "waiting") {
          this.tasks.set(task.taskId, task);
        }
      }
      this.notifyListeners();
    } catch {
      // History not available yet
    }
  }

  private async saveHistory(): Promise<void> {
    try {
      const tasks = this.getAllTasks();
      await saveDownloadHistory({ tasks, updatedAt: new Date().toISOString() });
    } catch {
      // Silently fail on save errors
    }
  }

  clearTasks(): void {
    this.tasks.clear();
  }

  getTaskStats(): {
    total: number;
    completed: number;
    failed: number;
    downloading: number;
  } {
    const tasks = this.getAllTasks();
    return {
      total: tasks.length,
      completed: tasks.filter((t) => t.status === "completed").length,
      failed: tasks.filter((t) => t.status === "failed").length,
      downloading: tasks.filter(
        (t) => t.status === "downloading" || t.status === "waiting"
      ).length,
    };
  }

  // ── Error Handling (Retry Logic) ──────────────────────────────────

  private _formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    if (i >= units.length) return `${bytes} B`;
    const value = bytes / Math.pow(1024, i);
    return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
  }
}

export const downloadManager = new DownloadManager();
