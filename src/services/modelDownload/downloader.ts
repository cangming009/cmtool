import { DownloadTask, DownloadStatus, DownloadSource } from "./types";

export interface ProgressCallback {
  (taskId: string, downloaded: number, total: number, speed: number): void;
}

export interface StatusCallback {
  (taskId: string, status: DownloadStatus, error?: string): void;
}

export abstract class BaseDownloader {
  protected tasks: Map<string, DownloadTask> = new Map();
  protected onProgress: ProgressCallback;
  protected onStatusChange: StatusCallback;
  protected abortControllers: Map<string, AbortController> = new Map();

  constructor(
    onProgress: ProgressCallback,
    onStatusChange: StatusCallback
  ) {
    this.onProgress = onProgress;
    this.onStatusChange = onStatusChange;
  }

  abstract source: DownloadSource;

  abstract validateRepoId(repoId: string): boolean;

  abstract startDownload(
    repoId: string,
    downloadDir: string,
    taskId: string
  ): Promise<void>;

  cancelDownload(taskId: string): boolean {
    const controller = this.abortControllers.get(taskId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(taskId);
    }

    const task = this.tasks.get(taskId);
    if (task && (task.status === "waiting" || task.status === "downloading")) {
      task.status = "cancelled";
      this.onStatusChange(taskId, "cancelled");
      return true;
    }
    return false;
  }

  getTask(taskId: string): DownloadTask | undefined {
    return this.tasks.get(taskId);
  }

  getAllTasks(): DownloadTask[] {
    return Array.from(this.tasks.values());
  }

  protected createTask(
    repoId: string,
    downloadDir: string,
    taskId: string
  ): DownloadTask {
    const task: DownloadTask = {
      taskId,
      repoId,
      source: this.source,
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
    return task;
  }

  protected getAbortSignal(taskId: string): AbortSignal {
    const controller = new AbortController();
    this.abortControllers.set(taskId, controller);
    return controller.signal;
  }

  cleanup(): void {
    for (const [taskId, controller] of this.abortControllers) {
      controller.abort();
    }
    this.abortControllers.clear();
    this.tasks.clear();
  }
}
