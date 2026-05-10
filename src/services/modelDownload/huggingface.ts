import { BaseDownloader } from "./downloader";
import { DownloadSource, SearchResult, ModelInfo, ModelFile } from "./types";

const HF_API_BASE = "https://huggingface.co/api";
const HF_TIMEOUT = 15000;

export class HuggingFaceDownloader extends BaseDownloader {
  source: DownloadSource = "HuggingFace";

  validateRepoId(repoId: string): boolean {
    if (!repoId || typeof repoId !== "string") return false;
    const parts = repoId.trim().split("/");
    return parts.length === 2 && parts[0].length > 0 && parts[1].length > 0;
  }

  static async searchModels(query: string, limit = 50): Promise<SearchResult[]> {
    const url = `${HF_API_BASE}/models?search=${encodeURIComponent(query)}&limit=${limit}&sort=trendingScore`;
    try {
      const resp = await fetch(url, {
        signal: AbortSignal.timeout(HF_TIMEOUT),
      });
      if (!resp.ok) return [];

      const models = await resp.json();
      return models.map((m: any) => {
        const size = HuggingFaceDownloader._calcModelSize(m);
        return {
          repo_id: m.id,
          name: m.id.split("/")[1] || m.id,
          downloads: m.downloads || 0,
          likes: m.likes || 0,
          size,
          size_formatted: formatSize(size),
          source: "HuggingFace" as DownloadSource,
          description: m.description || "",
          updated_at: m.lastModified || "",
        };
      });
    } catch {
      return [];
    }
  }

  static async getModelInfo(repoId: string): Promise<ModelInfo | null> {
    try {
      const resp = await fetch(`${HF_API_BASE}/models/${repoId}`, {
        signal: AbortSignal.timeout(HF_TIMEOUT),
      });
      if (!resp.ok) return null;

      const info = await resp.json();

      // Extract files with sizes
      const files: ModelFile[] = [];
      if (info.siblings) {
        for (const s of info.siblings) {
          files.push({
            name: s.rfilename,
            size: s.size || 0,
            size_formatted: formatSize(s.size || 0),
          });
        }
      }

      const totalSize = files.reduce((s, f) => s + f.size, 0);

      // Fetch README
      let modelCard = "";
      try {
        const readmeResp = await fetch(
          `https://huggingface.co/${repoId}/raw/main/README.md`,
          { signal: AbortSignal.timeout(HF_TIMEOUT) }
        );
        if (readmeResp.ok) {
          modelCard = await readmeResp.text();
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

      return {
        repo_id: info.id,
        name: info.id.split("/")[1] || info.id,
        description: info.description || "",
        model_card: modelCard,
        files,
        tags: info.tags || [],
        pipeline_tag: info.pipeline_tag || "",
        size: totalSize,
        size_formatted: formatSize(totalSize),
        downloads: info.downloads || 0,
        likes: info.likes || 0,
        source: "HuggingFace",
        created_at: info.createdAt || "",
        updated_at: info.lastModified || "",
      };
    } catch {
      return null;
    }
  }

  private static _calcModelSize(model: any): number {
    if (model.siblings) {
      return model.siblings.reduce((sum: number, s: any) => sum + (s.size || 0), 0);
    }
    return 0;
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
      // Get model info to list files
      const info = await HuggingFaceDownloader.getModelInfo(repoId);
      if (!info || info.files.length === 0) {
        throw new Error(
          `No files found for ${repoId}. The model may be empty or gated.\n` +
          `Try using the HuggingFace CLI:\npip install huggingface-hub\nhuggingface-cli download ${repoId}`
        );
      }

      task.totalSize = info.size;
      const startTime = Date.now();
      let totalDownloaded = 0;

      // Filter to only download relevant model files (skip .git files)
      const filesToDownload = info.files.filter(
        (f) => !f.name.startsWith(".git/")
      );

      for (const file of filesToDownload) {
        if (signal.aborted) break;

        const fileUrl = `https://huggingface.co/${repoId}/resolve/main/${file.name}`;
        const response = await fetch(fileUrl, { signal });

        if (!response.ok) {
          // Skip files that return 404 (might be generated on-the-fly)
          if (response.status === 404) continue;
          throw new Error(`Failed to download ${file.name}: HTTP ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) continue;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          totalDownloaded += value.length;
          const elapsed = (Date.now() - startTime) / 1000;
          const speed = elapsed > 0 ? totalDownloaded / elapsed : 0;

          task.downloadedSize = totalDownloaded;
          task.downloadSpeed = speed;
          if (task.totalSize > 0) {
            task.progress = Math.min(
              (totalDownloaded / task.totalSize) * 100,
              99
            );
          }
          this.onProgress(taskId, totalDownloaded, task.totalSize, speed);
        }
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
}

function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  if (i >= units.length) return `${bytes} B`;
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
