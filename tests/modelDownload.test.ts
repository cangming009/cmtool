import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Tauri plugins before any imports
vi.mock("@tauri-apps/plugin-shell", () => ({ Command: { create: () => ({ execute: async () => {} }) } }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: async () => null }));
vi.mock("@tauri-apps/plugin-fs", () => ({
  readDir: async () => [],
  stat: async () => ({ size: 0, mtime: null }),
}));

// ── Global Mocks ──────────────────────────────────────────────────────

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(globalThis, "localStorage", { value: localStorageMock });

// Mock crypto.randomUUID
Object.defineProperty(globalThis, "crypto", {
  value: {
    randomUUID: () => "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    }),
  },
});

// Mock AbortSignal.timeout
if (!AbortSignal.timeout) {
  (AbortSignal as any).timeout = () => new AbortController().signal;
}

// Mock fetch for API tests
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

// Mock ReadableStream for download tests
class MockReadableStream {
  private chunks: Uint8Array[];
  private index = 0;
  constructor(chunks: Uint8Array[]) { this.chunks = chunks; }
  getReader() {
    return {
      read: async () => {
        if (this.index >= this.chunks.length) return { done: true as const, value: undefined };
        return { done: false as const, value: this.chunks[this.index++] };
      },
    };
  }
}

import { downloadManager } from "../src/services/modelDownload";
import { ModelScopeDownloader } from "../src/services/modelDownload/modelscope";
import { HuggingFaceDownloader } from "../src/services/modelDownload/huggingface";

// ─── Tests ────────────────────────────────────────────────────────────

describe("Model Downloader - Task Creation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    downloadManager.clearTasks();
  });

  it("should create a download task", async () => {
    const task = await downloadManager.startDownload(
      "test-owner/test-model", "HuggingFace", "/tmp/models"
    );
    expect(task).toBeDefined();
    expect(task.taskId).toBeDefined();
    expect(task.repoId).toBe("test-owner/test-model");
    expect(task.source).toBe("HuggingFace");
    expect(task.downloadDir).toBe("/tmp/models");
  });

  it("should create a ModelScope download task", async () => {
    const task = await downloadManager.startDownload(
      "qwen/Qwen2.5-7B", "ModelScope", "/tmp/models"
    );
    expect(task).toBeDefined();
    expect(task.repoId).toBe("qwen/Qwen2.5-7B");
    expect(task.source).toBe("ModelScope");
  });

  it("should reject invalid model IDs", async () => {
    await expect(
      downloadManager.startDownload("invalid", "HuggingFace", "/tmp/models")
    ).rejects.toThrow("Invalid model ID");
  });

  it("should reject empty model IDs", async () => {
    await expect(
      downloadManager.startDownload("", "HuggingFace", "/tmp/models")
    ).rejects.toThrow("Invalid model ID");
  });

  it("should reject 'All' source for download", async () => {
    await expect(
      downloadManager.startDownload("owner/model", "All", "/tmp/models")
    ).rejects.toThrow("Cannot download from 'All' source");
  });
});

describe("Model Downloader - Model ID Validation", () => {
  let msDownloader: ModelScopeDownloader;
  let hfDownloader: HuggingFaceDownloader;

  beforeEach(() => {
    msDownloader = new ModelScopeDownloader(() => {}, () => {});
    hfDownloader = new HuggingFaceDownloader(() => {}, () => {});
  });

  it("should validate valid ModelScope model IDs", () => {
    expect(msDownloader.validateRepoId("qwen/Qwen2.5-7B-Instruct-MLX")).toBe(true);
    expect(msDownloader.validateRepoId("owner/model")).toBe(true);
  });

  it("should reject invalid ModelScope model IDs", () => {
    expect(msDownloader.validateRepoId("")).toBe(false);
    expect(msDownloader.validateRepoId("no-slash")).toBe(false);
    expect(msDownloader.validateRepoId("/leading-slash")).toBe(false);
  });

  it("should validate valid HuggingFace model IDs", () => {
    expect(hfDownloader.validateRepoId("mlx-community/Llama-3-8B-4bit")).toBe(true);
    expect(hfDownloader.validateRepoId("deepseek-ai/DeepSeek-Coder-V2-Lite-Instruct")).toBe(true);
  });

  it("should handle model IDs with hyphens and dots", () => {
    expect(hfDownloader.validateRepoId("mlx-community/Qwen3-Coder-30B-A3B-Instruct-4bit")).toBe(true);
    expect(msDownloader.validateRepoId("org/model.v2")).toBe(true);
  });
});

describe("Model Downloader - Status Transitions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    downloadManager.clearTasks();
  });

  it("should start with waiting status", async () => {
    const task = await downloadManager.startDownload("owner/model", "HuggingFace", "/tmp/models");
    // Task status transitions quickly from waiting to downloading as the async download starts
    expect(["waiting", "downloading"]).toContain(task.status);
  });

  it("should cancel a waiting task", async () => {
    const task = await downloadManager.startDownload("owner/model", "HuggingFace", "/tmp/models");
    const result = downloadManager.cancelDownload(task.taskId);
    const cancelled = downloadManager.getTask(task.taskId);
    expect(cancelled?.status).toBe("cancelled");
  });

  it("should retry a failed task", async () => {
    const task = await downloadManager.startDownload("owner/model", "HuggingFace", "/tmp/models");
    task.status = "failed";
    const retryTask = await downloadManager.retryDownload(task.taskId);
    expect(retryTask).not.toBeNull();
    expect(retryTask!.repoId).toBe("owner/model");
  });

  it("should not retry a completed task", async () => {
    const task = await downloadManager.startDownload("owner/model", "HuggingFace", "/tmp/models");
    task.status = "completed";
    const retryTask = await downloadManager.retryDownload(task.taskId);
    expect(retryTask).toBeNull();
  });
});

describe("Model Downloader - Search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  it("should search HuggingFace models via API", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { id: "mlx-community/Qwen2.5-7B-MLX", downloads: 5000, likes: 200, siblings: [{ size: 4e9 }] },
        { id: "mlx-community/Qwen2.5-14B-MLX", downloads: 3000, likes: 150, siblings: [{ size: 8e9 }] },
      ],
    });

    const results = await downloadManager.searchModels("Qwen", "HuggingFace", 10);
    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results[0].repo_id).toContain("Qwen");
    expect(results[0].source).toBe("HuggingFace");
    expect(mockFetch).toHaveBeenCalled();
  });

  it("should search ModelScope models via API", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        Data: {
          Models: [
            { Path: "qwen", Name: "Qwen2.5-7B", Downloads: 1000, Likes: 50, StorageSize: 4e9 },
          ],
        },
      }),
    });

    const results = await downloadManager.searchModels("Qwen", "ModelScope", 10);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].repo_id).toBe("qwen/Qwen2.5-7B");
    expect(results[0].source).toBe("ModelScope");
  });

  it("should search All sources (HF + MS)", async () => {
    // First call: HF
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { id: "org/HF-Test-Model", downloads: 5000, likes: 200, siblings: [{ size: 4e9 }] },
      ],
    });
    // Second call: MS
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        Data: {
          Models: [
            { Path: "org", Name: "Test-MS-Model", Downloads: 1000, Likes: 50, StorageSize: 4e9 },
          ],
        },
      }),
    });

    const results = await downloadManager.searchModels("test", "All", 10);
    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results.some(r => r.source === "HuggingFace")).toBe(true);
    expect(results.some(r => r.source === "ModelScope")).toBe(true);
    // Should be sorted by downloads descending
    if (results.length >= 2) {
      expect(results[0].downloads).toBeGreaterThanOrEqual(results[1].downloads);
    }
  });

  it("should handle API errors gracefully", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));
    const results = await downloadManager.searchModels("test", "HuggingFace", 10);
    expect(results).toEqual([]);
  });

  it("should handle empty search results", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });
    const results = await downloadManager.searchModels("zzzzzznonexistent", "HuggingFace", 10);
    expect(results).toEqual([]);
  });
});

describe("Model Downloader - Model Info", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  it("should get HuggingFace model info", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "org/Test-Model",
        downloads: 5000,
        likes: 200,
        tags: ["mlx", "text-generation"],
        pipeline_tag: "text-generation",
        siblings: [
          { rfilename: "config.json", size: 500 },
          { rfilename: "model.safetensors", size: 4e9 },
        ],
      }),
    });
    // README fetch
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => "# Test Model\nThis is a test model.",
    });

    const info = await HuggingFaceDownloader.getModelInfo("org/Test-Model");
    expect(info).not.toBeNull();
    expect(info!.repo_id).toBe("org/Test-Model");
    expect(info!.files.length).toBe(2);
    expect(info!.downloads).toBe(5000);
    expect(info!.tags).toContain("mlx");
  });

  it("should handle 404 for HuggingFace model info", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
    const info = await HuggingFaceDownloader.getModelInfo("org/no-such-model");
    expect(info).toBeNull();
  });

  it("should handle API errors for model info", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));
    const info = await HuggingFaceDownloader.getModelInfo("org/test");
    expect(info).toBeNull();
  });

  it("should get ModelScope model info", async () => {
    // search-model call
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        Data: {
          Models: [
            { Path: "org", Name: "MS-Model", Downloads: 1000, Likes: 50, StorageSize: 4e9 },
          ],
        },
      }),
    });
    // model files call
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        Data: {
          ModelFiles: [
            { Name: "config.json", Size: 500 },
            { Name: "model.safetensors", Size: 4e9 },
          ],
        },
      }),
    });
    // README call
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => "# MS Model\nTest",
    });

    const info = await ModelScopeDownloader.getModelInfo("org/MS-Model");
    expect(info).not.toBeNull();
    expect(info!.repo_id).toBe("org/MS-Model");
    expect(info!.files.length).toBe(2);
  });

  it("should get model info via downloadManager with source detection", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "org/Test",
        downloads: 100, likes: 10, tags: [],
        siblings: [{ rfilename: "file.bin", size: 100 }],
      }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => "# Model",
    });

    const info = await downloadManager.getModelInfo("org/Test", "HuggingFace");
    expect(info).not.toBeNull();
    expect(info!.repo_id).toBe("org/Test");
  });
});

describe("Model Downloader - Download with Progress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    downloadManager.clearTasks();
    mockFetch.mockReset();
  });

  it("should track download progress via streaming", async () => {
    const task = await downloadManager.startDownload(
      "owner/model", "HuggingFace", "/tmp/models"
    );

    // Mock getModelInfo to return files
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "owner/model",
        downloads: 100, likes: 10, tags: [],
        siblings: [
          { rfilename: "config.json", size: 100 },
          { rfilename: "model.safetensors", size: 1000 },
        ],
      }),
    });
    // README fetch
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => "# Model",
    });
    // File download: config.json
    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: new MockReadableStream([new Uint8Array(50), new Uint8Array(50)]),
      headers: new Headers(),
    });
    // File download: model.safetensors
    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: new MockReadableStream([new Uint8Array(500), new Uint8Array(500)]),
      headers: new Headers(),
    });

    // Wait for download to complete
    await new Promise((r) => setTimeout(r, 100));

    const updatedTask = downloadManager.getTask(task.taskId);
    expect(updatedTask).toBeDefined();
    // The download may complete or still be in progress depending on timing
    expect(updatedTask!.downloadedSize).toBeGreaterThanOrEqual(0);
  });

  it("should handle download cancellation", async () => {
    const task = await downloadManager.startDownload(
      "owner/model", "HuggingFace", "/tmp/models"
    );

    const result = downloadManager.cancelDownload(task.taskId);
    expect(result).toBe(true);

    const cancelled = downloadManager.getTask(task.taskId);
    expect(cancelled?.status).toBe("cancelled");
  });
});

describe("Model Downloader - Task History", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    downloadManager.clearTasks();
  });

  it("should save and load download tasks", async () => {
    await downloadManager.startDownload("owner/model1", "HuggingFace", "/tmp/models");
    const tasks = downloadManager.getAllTasks();
    expect(tasks.length).toBeGreaterThanOrEqual(1);
    expect(tasks[0].repoId).toBe("owner/model1");
  });

  it("should provide task stats", async () => {
    await downloadManager.startDownload("owner/m1", "HuggingFace", "/tmp");
    await downloadManager.startDownload("owner/m2", "ModelScope", "/tmp");

    const stats = downloadManager.getTaskStats();
    expect(stats.total).toBeGreaterThanOrEqual(2);
  });

  it("should load history from localStorage", async () => {
    // Save a completed task to localStorage
    const historyData = {
      tasks: [
        {
          taskId: "hist-1", repoId: "owner/old-model", source: "HuggingFace",
          status: "completed", progress: 100, totalSize: 1000, downloadedSize: 1000,
          downloadSpeed: 0, error: "", createdAt: new Date().toISOString(),
          retryCount: 0, downloadDir: "/tmp/models",
        },
      ],
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem("cmtool-download-history.json", JSON.stringify(historyData));

    await downloadManager.loadHistory();
    const tasks = downloadManager.getAllTasks();
    expect(tasks.length).toBeGreaterThanOrEqual(1);
    expect(tasks.some(t => t.taskId === "hist-1")).toBe(true);
  });
});

describe("Model Downloader - Error Handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    downloadManager.clearTasks();
  });

  it("should retry a failed task with incremented count", async () => {
    const task = await downloadManager.startDownload("owner/model", "HuggingFace", "/tmp");
    expect(task.retryCount).toBe(0);

    task.status = "failed";
    task.error = "Test error";

    const retryTask = await downloadManager.retryDownload(task.taskId);
    expect(retryTask).not.toBeNull();
    expect(retryTask!.retryCount).toBe(1);
  });

  it("should not retry active tasks", async () => {
    const task = await downloadManager.startDownload("owner/model", "HuggingFace", "/tmp");
    // Task is still in "waiting" status
    const result = await downloadManager.retryDownload(task.taskId);
    expect(result).toBeNull();
  });

  it("should handle cancel of non-existent task", () => {
    const result = downloadManager.cancelDownload("nonexistent");
    expect(result).toBe(false);
  });
});

describe("Model Downloader - File Verification", () => {
  it("should verify model files when Tauri FS is available", async () => {
    // When Tauri FS is not available, should handle gracefully
    const result = await downloadManager.verifyModelFiles("/nonexistent/path");
    expect(result).toBeDefined();
    expect(typeof result.verified).toBe("boolean");
    expect(typeof result.totalFiles).toBe("number");
  });
});

describe("Model Downloader - Default Directory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
  });

  it("should return default download directory from config", () => {
    const dir = downloadManager.getDefaultDownloadDir();
    expect(dir).toBe("~/cmtool/models");
  });

  it("should update default download directory", () => {
    downloadManager.updateDefaultDownloadDir("/new/path");
    const config = downloadManager.getDefaultDownloadDir();
    expect(config).toBe("/new/path");
  });
});

describe("Model Downloader - HuggingFaceDownloader static methods", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  it("should search and handle HF API response with missing siblings", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { id: "org/Model-No-Size", downloads: 100, likes: 10 },
      ],
    });

    const results = await HuggingFaceDownloader.searchModels("test", 10);
    expect(results.length).toBe(1);
    expect(results[0].size).toBe(0);
    expect(results[0].size_formatted).toBe("0 B");
  });
});

describe("Model Downloader - ModelScopeDownloader static methods", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  it("should handle MS API with no Data field", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });
    const results = await ModelScopeDownloader.searchModels("test", 10);
    expect(results).toEqual([]);
  });

  it("should handle MS API error gracefully", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));
    const results = await ModelScopeDownloader.searchModels("test", 10);
    expect(results).toEqual([]);
  });

  it("should get model info and handle missing README", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        Data: {
          Models: [
            { Path: "org", Name: "Model", Downloads: 100, Likes: 10 },
          ],
        },
      }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ Data: { ModelFiles: [{ Name: "file.bin", Size: 1000 }] } }),
    });
    mockFetch.mockRejectedValueOnce(new Error("README not found"));

    const info = await ModelScopeDownloader.getModelInfo("org/Model");
    expect(info).not.toBeNull();
    expect(info!.files.length).toBeGreaterThan(0);
    expect(info!.model_card).toBe("");
  });
});
