import { BaseDownloader } from "./downloader";
import { DownloadSource, DownloadStatus, SearchResult, ModelInfo, ModelFile } from "./types";

const MS_API_BASE = "https://modelscope.cn";
const MS_API_TIMEOUT = 15000;

export class ModelScopeDownloader extends BaseDownloader {
  source: DownloadSource = "ModelScope";

  validateRepoId(repoId: string): boolean {
    if (!repoId || typeof repoId !== "string") return false;
    const parts = repoId.trim().split("/");
    return parts.length === 2 && parts[0].length > 0 && parts[1].length > 0;
  }

  static async searchModels(query: string, limit = 50): Promise<SearchResult[]> {
    const url = `${MS_API_BASE}/api/v1/models/`;
    const payload = { PageSize: limit, Name: query };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), MS_API_TIMEOUT);

    try {
      const resp = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!resp.ok) return [];

      const data = (await resp.json())?.Data || {};
      const models = data.Models || data.models || [];
      const queryLower = query.toLowerCase();

      const results: SearchResult[] = [];
      for (const entry of models) {
        const path = entry.Path || "";
        const name = entry.Name || "";
        if (!path || !name) continue;
        if (queryLower && !name.toLowerCase().includes(queryLower)) continue;

        const size = entry.StorageSize || 0;
        results.push({
          repo_id: `${path}/${name}`,
          name,
          downloads: entry.Downloads || 0,
          likes: entry.Likes || entry.Stars || 0,
          size,
          size_formatted: formatSize(size),
          source: "ModelScope",
        });
      }
      return results;
    } catch {
      return [];
    } finally {
      clearTimeout(timeout);
    }
  }

  static async getModelInfo(repoId: string): Promise<ModelInfo | null> {
    try {
      // Fetch model metadata via the list API with a targeted search
      const searchResults = await ModelScopeDownloader.searchModels(
        repoId.split("/")[1] || repoId,
        50
      );
      const match = searchResults.find((r) => r.repo_id === repoId);

      // Fetch file list
      const files = await ModelScopeDownloader._fetchModelFiles(repoId);

      // Fetch README
      let modelCard = "";
      try {
        const readmeUrl = `${MS_API_BASE}/api/v1/models/${repoId}/repo?FilePath=README.md&Revision=master`;
        const readmeResp = await fetch(readmeUrl, {
          signal: AbortSignal.timeout(MS_API_TIMEOUT),
        });
        if (readmeResp.ok) {
          modelCard = await readmeResp.text();
          // Strip YAML front matter
          if (modelCard.startsWith("---")) {
            const end = modelCard.indexOf("---", 3);
            if (end !== -1) {
              modelCard = modelCard.slice(end + 3).trim();
            }
          }
        }
      } catch {
        // README not available
      }

      const totalSize = files.reduce((sum, f) => sum + f.size, 0);

      return {
        repo_id: repoId,
        name: match?.name || repoId.split("/")[1] || repoId,
        description: "",
        model_card: modelCard,
        files,
        tags: [],
        pipeline_tag: "",
        size: totalSize,
        size_formatted: formatSize(totalSize),
        downloads: match?.downloads || 0,
        likes: match?.likes || 0,
        source: "ModelScope",
      };
    } catch {
      return null;
    }
  }

  private static async _fetchModelFiles(repoId: string): Promise<ModelFile[]> {
    try {
      const resp = await fetch(
        `${MS_API_BASE}/api/v1/models/${repoId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ PageSize: 100 }),
          signal: AbortSignal.timeout(MS_API_TIMEOUT),
        }
      );
      if (!resp.ok) return [];

      const data = (await resp.json())?.Data || {};
      // Try to get files from the response - MS API returns file info differently
      const fileList = data.ModelFiles || data.Files || [];
      return fileList.map((f: any) => ({
        name: f.Name || f.Path || "",
        size: f.Size || 0,
        size_formatted: formatSize(f.Size || 0),
      }));
    } catch {
      return [];
    }
  }

  async startDownload(
    repoId: string,
    downloadDir: string,
    taskId: string
  ): Promise<void> {
    const task = this.createTask(repoId, downloadDir, taskId);
    task.status = "downloading";
    this.onStatusChange(taskId, "downloading");

    const signal = this.getAbortSignal(taskId);

    try {
      // Fetch model files from API
      const files = await ModelScopeDownloader._fetchModelFiles(repoId);
      if (files.length === 0) {
        throw new Error(
          `No downloadable files found for ${repoId}. ` +
          `Try using the ModelScope CLI:\npip install modelscope\nmodelscope download --model ${repoId}`
        );
      }

      task.totalSize = files.reduce((s, f) => s + f.size, 0);
      const startTime = Date.now();
      let totalDownloaded = 0;

      // Check for existing partial downloads (resume support)
      const existingFiles = await this._listExistingFiles(downloadDir, repoId);
      const completedFiles = new Set(existingFiles);

      for (const file of files) {
        if (signal.aborted) break;
        if (completedFiles.has(file.name)) {
          totalDownloaded += file.size;
          task.downloadedSize = totalDownloaded;
          this.onProgress(taskId, totalDownloaded, task.totalSize, 0);
          continue;
        }

        await this._downloadFile(repoId, file.name, signal, (chunkSize) => {
          totalDownloaded += chunkSize;
          const elapsed = (Date.now() - startTime) / 1000;
          const speed = elapsed > 0 ? totalDownloaded / elapsed : 0;
          task.downloadedSize = totalDownloaded;
          task.downloadSpeed = speed;
          if (task.totalSize > 0) {
            task.progress = Math.min((totalDownloaded / task.totalSize) * 100, 99);
          }
          this.onProgress(taskId, totalDownloaded, task.totalSize, speed);
        });
      }

      if (signal.aborted) {
        task.status = "cancelled";
        this.onStatusChange(taskId, "cancelled");
        return;
      }

      task.status = "completed";
      task.progress = 100;
      task.downloadedSize = totalDownloaded;
      task.completedAt = new Date().toISOString();
      this.onStatusChange(taskId, "completed");
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") {
        task.status = "cancelled";
        this.onStatusChange(taskId, "cancelled");
        return;
      }
      task.status = "failed";
      task.error = err instanceof Error ? err.message : String(err);
      this.onStatusChange(taskId, "failed", task.error);
    }
  }

  private async _downloadFile(
    repoId: string,
    filename: string,
    signal: AbortSignal,
    onChunk: (size: number) => void
  ): Promise<void> {
    const url = `${MS_API_BASE}/models/${repoId}/resolve/main/${filename}`;
    const response = await fetch(url, { signal });
    if (!response.ok) {
      throw new Error(`Failed to download ${filename}: HTTP ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error(`Cannot read response for ${filename}`);

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      onChunk(value.length);
    }
  }

  private async _listExistingFiles(
    downloadDir: string,
    repoId: string
  ): Promise<string[]> {
    try {
      // In Tauri, we'd use the FS plugin to list files
      // For now, assume no existing files (resume requires Tauri FS access)
      return [];
    } catch {
      return [];
    }
  }
}

function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  if (i >= units.length) return `${bytes} B`;
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
