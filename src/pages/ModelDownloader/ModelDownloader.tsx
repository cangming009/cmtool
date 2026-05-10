import React, { useEffect, useState, useCallback } from "react";
import {
  Download, XCircle, RefreshCw, FolderOpen, ExternalLink, Trash2,
  CheckCircle, AlertCircle, Loader2, Clock, Search, FileText,
  ChevronRight, Eye, Folder, Star, ArrowUpDown, HardDrive,
} from "lucide-react";
import { downloadManager, DownloadSource, DownloadTask } from "../../services/modelDownload";
import { SearchResult, ModelInfo, LocalModel } from "../../services/modelDownload/types";
import { formatBytes, formatSpeed, formatEta } from "../../utils/format";
import { getConfig, updateConfig } from "../../storage/config";

const SOURCES: DownloadSource[] = ["All", "HuggingFace", "ModelScope"];
type Tab = "downloads" | "local" | "history";

export default function ModelDownloader() {
  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchSource, setSearchSource] = useState<DownloadSource>("All");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedModel, setSelectedModel] = useState<SearchResult | null>(null);
  const [modelDetail, setModelDetail] = useState<ModelInfo | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  // Download form state
  const [repoId, setRepoId] = useState("");
  const [source, setSource] = useState<DownloadSource>("HuggingFace");
  const [downloadDir, setDownloadDir] = useState("");
  const [tasks, setTasks] = useState<DownloadTask[]>([]);
  const [error, setError] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);

  // Local models state
  const [localModels, setLocalModels] = useState<LocalModel[]>([]);
  const [isScanning, setIsScanning] = useState(false);

  // Tab state
  const [activeTab, setActiveTab] = useState<Tab>("downloads");

  useEffect(() => {
    const cfg = getConfig();
    setDownloadDir(cfg.defaultDownloadDir);
    downloadManager.loadHistory();
    setTasks(downloadManager.getAllTasks());

    const unsubscribe = downloadManager.subscribe(() => {
      setTasks([...downloadManager.getAllTasks()]);
    });
    return unsubscribe;
  }, []);

  // ── Search ──────────────────────────────────────────────────────

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setSearchResults([]);
    setSelectedModel(null);
    setModelDetail(null);
    try {
      const results = await downloadManager.searchModels(searchQuery.trim(), searchSource, 50);
      setSearchResults(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery, searchSource]);

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") handleSearch();
    },
    [handleSearch]
  );

  const handleSelectResult = useCallback(
    async (result: SearchResult) => {
      setSelectedModel(result);
      setRepoId(result.repo_id);
      setSource(result.source === "All" ? "HuggingFace" : result.source);
      setIsLoadingDetail(true);
      setModelDetail(null);
      try {
        const detail = await downloadManager.getModelInfo(result.repo_id, result.source);
        setModelDetail(detail);
      } catch {
        setModelDetail(null);
      } finally {
        setIsLoadingDetail(false);
      }
    },
    []
  );

  // ── Download ─────────────────────────────────────────────────────

  const handleStartDownload = useCallback(async () => {
    setError("");
    if (!repoId.trim()) { setError("Please enter a model ID"); return; }
    if (!downloadDir.trim()) { setError("Please enter a download directory"); return; }

    setIsDownloading(true);
    try {
      await downloadManager.startDownload(repoId.trim(), source, downloadDir.trim());
      setRepoId("");
      setTasks(downloadManager.getAllTasks());
      setActiveTab("downloads");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsDownloading(false);
    }
  }, [repoId, source, downloadDir]);

  const handleCancel = useCallback((taskId: string) => {
    downloadManager.cancelDownload(taskId);
  }, []);

  const handleRetry = useCallback(async (taskId: string) => {
    try {
      await downloadManager.retryDownload(taskId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const handleSelectDir = useCallback(async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ directory: true, multiple: false, title: "Select Download Directory" });
      if (selected) {
        setDownloadDir(selected);
        updateConfig({ defaultDownloadDir: selected });
      }
    } catch {
      setError("Directory selection dialog not available. Please type the path manually.");
    }
  }, []);

  // ── Local Scan ───────────────────────────────────────────────────

  const handleScanLocal = useCallback(async () => {
    setIsScanning(true);
    try {
      const models = await downloadManager.scanLocalModels(downloadDir);
      setLocalModels(models);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Local scan failed");
    } finally {
      setIsScanning(false);
    }
  }, [downloadDir]);

  const handleOpenDir = useCallback(async () => {
    try {
      await downloadManager.openDownloadDirectory(downloadDir);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cannot open directory");
    }
  }, [downloadDir]);

  const handleVerifyModel = useCallback(async (modelPath: string) => {
    try {
      const result = await downloadManager.verifyModelFiles(modelPath);
      setLocalModels((prev) =>
        prev.map((m) =>
          m.path === modelPath ? { ...m, verified: result.verified } : m
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    }
  }, []);

  // ── Status Helpers ───────────────────────────────────────────────

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed": return <CheckCircle size={16} className="text-[var(--success)]" />;
      case "failed": return <AlertCircle size={16} className="text-[var(--error)]" />;
      case "cancelled": return <XCircle size={16} className="text-[var(--warning)]" />;
      case "downloading": return <Loader2 size={16} className="text-[var(--info)] animate-spin" />;
      case "waiting": return <Clock size={16} className="text-[var(--text-muted)]" />;
      default: return <Clock size={16} />;
    }
  };

  const activeDownloads = tasks.filter((t) => t.status === "downloading" || t.status === "waiting");
  const historyTasks = tasks.filter((t) => t.status !== "downloading" && t.status !== "waiting");

  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Model Downloader</h1>

      {error && (
        <div className="mb-4 p-3 rounded-md bg-red-900/20 border border-red-800 text-sm text-[var(--error)]">
          {error}
          <button className="ml-2 underline" onClick={() => setError("")}>Dismiss</button>
        </div>
      )}

      {/* ═══════════════════ Search Section ═══════════════════ */}
      <div className="bg-[var(--bg-secondary)] rounded-lg p-5 border border-[var(--border-color)] mb-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-secondary)] mb-4">
          Search Models
        </h2>
        <div className="flex gap-2 mb-4">
          <div className="flex gap-1 bg-[var(--bg-tertiary)] rounded-md p-0.5">
            {SOURCES.map((s) => (
              <button
                key={s}
                onClick={() => setSearchSource(s)}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                  searchSource === s
                    ? "bg-[var(--accent)] text-white"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="flex-1 flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search model name (e.g., Qwen, Llama, DeepSeek)..."
              className="flex-1 px-3 py-2 rounded-md bg-[var(--bg-tertiary)] border border-[var(--border-color)] text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
            />
            <button
              onClick={handleSearch}
              disabled={isSearching || !searchQuery.trim()}
              className="flex items-center gap-2 px-4 py-2 rounded-md bg-[var(--accent)] text-white text-sm font-medium hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50"
            >
              <Search size={16} />
              {isSearching ? "Searching..." : "Search"}
            </button>
          </div>
        </div>

        {/* Search Results */}
        {isSearching && (
          <div className="flex items-center gap-2 py-4 text-[var(--text-muted)] text-sm">
            <Loader2 size={16} className="animate-spin" /> Searching...
          </div>
        )}

        {!isSearching && searchResults.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[var(--text-muted)] text-xs uppercase border-b border-[var(--border-color)]">
                  <th className="text-left py-2 px-2 font-medium">Model</th>
                  <th className="text-right py-2 px-2 font-medium">Source</th>
                  <th className="text-right py-2 px-2 font-medium">Downloads</th>
                  <th className="text-right py-2 px-2 font-medium">Likes</th>
                  <th className="text-right py-2 px-2 font-medium">Size</th>
                  <th className="text-right py-2 px-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {searchResults.map((result) => (
                  <tr
                    key={`${result.source}-${result.repo_id}`}
                    className={`border-b border-[var(--border-color)] hover:bg-[var(--bg-tertiary)] cursor-pointer transition-colors ${
                      selectedModel?.repo_id === result.repo_id ? "bg-[var(--bg-tertiary)]" : ""
                    }`}
                    onClick={() => handleSelectResult(result)}
                  >
                    <td className="py-2.5 px-2">
                      <div className="font-medium text-[var(--text-primary)]">{result.name}</div>
                      <div className="text-xs text-[var(--text-muted)]">{result.repo_id}</div>
                    </td>
                    <td className="py-2.5 px-2 text-right">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        result.source === "HuggingFace"
                          ? "bg-yellow-900/30 text-yellow-400"
                          : "bg-blue-900/30 text-blue-400"
                      }`}>
                        {result.source}
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-right text-[var(--text-secondary)]">
                      {result.downloads.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-2 text-right text-[var(--text-secondary)]">
                      {result.likes.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-2 text-right text-[var(--text-secondary)]">
                      {result.size_formatted || "—"}
                    </td>
                    <td className="py-2.5 px-2 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedModel(result);
                          setRepoId(result.repo_id);
                          setSource(result.source === "All" ? "HuggingFace" : result.source);
                        }}
                        className="p-1.5 rounded hover:bg-[var(--bg-secondary)] text-[var(--accent)]"
                        title="Download this model"
                      >
                        <Download size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-[var(--text-muted)] mt-2">
              Showing {searchResults.length} results
            </p>
          </div>
        )}

        {!isSearching && searchQuery && searchResults.length === 0 && (
          <div className="text-center py-6 text-[var(--text-muted)] text-sm">
            No models found matching "{searchQuery}"
          </div>
        )}
      </div>

      {/* ═══════════════════ Two-column: Detail + Download Form ═══════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Model Detail Panel */}
        <div className="bg-[var(--bg-secondary)] rounded-lg p-5 border border-[var(--border-color)]">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-secondary)] mb-4">
            Model Detail
          </h2>
          {isLoadingDetail && (
            <div className="flex items-center gap-2 py-4 text-[var(--text-muted)] text-sm">
              <Loader2 size={16} className="animate-spin" /> Loading details...
            </div>
          )}
          {!isLoadingDetail && !selectedModel && (
            <div className="text-center py-8 text-[var(--text-muted)] text-sm">
              <FileText size={32} className="mx-auto mb-2 opacity-50" />
              Select a model from search results to view details
            </div>
          )}
          {!isLoadingDetail && selectedModel && (
            <div>
              <h3 className="font-semibold text-[var(--text-primary)]">{selectedModel.name}</h3>
              <p className="text-xs text-[var(--text-muted)] mb-3">{selectedModel.repo_id}</p>
              <div className="flex gap-3 text-xs text-[var(--text-secondary)] mb-3">
                <span>Downloads: {selectedModel.downloads.toLocaleString()}</span>
                <span>Likes: {selectedModel.likes.toLocaleString()}</span>
                <span>Size: {selectedModel.size_formatted || "—"}</span>
              </div>

              {modelDetail && (
                <div className="space-y-3">
                  {modelDetail.files.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-[var(--text-secondary)] mb-1">Files ({modelDetail.files.length})</p>
                      <div className="max-h-32 overflow-y-auto space-y-0.5">
                        {modelDetail.files.slice(0, 20).map((f) => (
                          <div key={f.name} className="flex justify-between text-xs text-[var(--text-muted)]">
                            <span className="truncate max-w-[70%]">{f.name}</span>
                            <span>{f.size_formatted}</span>
                          </div>
                        ))}
                        {modelDetail.files.length > 20 && (
                          <p className="text-xs text-[var(--text-muted)]">...and {modelDetail.files.length - 20} more files</p>
                        )}
                      </div>
                    </div>
                  )}

                  {modelDetail.model_card && (
                    <div>
                      <p className="text-xs font-medium text-[var(--text-secondary)] mb-1">README</p>
                      <div className="max-h-40 overflow-y-auto text-xs text-[var(--text-muted)] bg-[var(--bg-tertiary)] rounded p-2 whitespace-pre-wrap">
                        {modelDetail.model_card.slice(0, 1000)}
                        {modelDetail.model_card.length > 1000 && "\n..."}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Download Form */}
        <div className="bg-[var(--bg-secondary)] rounded-lg p-5 border border-[var(--border-color)]">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-secondary)] mb-4">
            Download Model
          </h2>
          <div className="space-y-4">
            {/* Source */}
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Source</label>
              <div className="flex gap-2">
                {(["HuggingFace", "ModelScope"] as DownloadSource[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSource(s)}
                    className={`flex-1 py-2 px-3 rounded-md text-sm border transition-colors ${
                      source === s
                        ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                        : "bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border-[var(--border-color)] hover:border-[var(--accent)]"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Model ID */}
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Model ID</label>
              <input
                type="text"
                value={repoId}
                onChange={(e) => setRepoId(e.target.value)}
                placeholder="e.g., Qwen/Qwen3-Coder-30B-A3B-Instruct"
                className="w-full px-3 py-2 rounded-md bg-[var(--bg-tertiary)] border border-[var(--border-color)] text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>

            {/* Download Directory */}
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Download Directory</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={downloadDir}
                  onChange={(e) => setDownloadDir(e.target.value)}
                  placeholder="~/cmtool/models"
                  className="flex-1 px-3 py-2 rounded-md bg-[var(--bg-tertiary)] border border-[var(--border-color)] text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
                />
                <button
                  onClick={handleSelectDir}
                  className="px-3 py-2 rounded-md bg-[var(--bg-tertiary)] border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                  title="Browse"
                >
                  <FolderOpen size={18} />
                </button>
              </div>
            </div>

            <button
              onClick={handleStartDownload}
              disabled={isDownloading}
              className="flex items-center gap-2 px-4 py-2 rounded-md bg-[var(--accent)] text-white text-sm font-medium hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50"
            >
              <Download size={16} />
              {isDownloading ? "Starting..." : "Start Download"}
            </button>
          </div>
        </div>
      </div>

      {/* ═══════════════════ Bottom Tabs ═══════════════════ */}
      <div className="bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)] overflow-hidden">
        {/* Tab bar */}
        <div className="flex border-b border-[var(--border-color)]">
          {[
            { id: "downloads" as Tab, label: "Downloads", icon: Download },
            { id: "local" as Tab, label: "Local Models", icon: HardDrive },
            { id: "history" as Tab, label: "History", icon: Clock },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "text-[var(--accent)] border-b-2 border-[var(--accent)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              <tab.icon size={16} />
              {tab.label}
              {tab.id === "downloads" && activeDownloads.length > 0 && (
                <span className="bg-[var(--accent)] text-white text-xs rounded-full px-1.5 py-0.5">
                  {activeDownloads.length}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="p-4">
          {/* Tab: Active Downloads */}
          {activeTab === "downloads" && (
            <div>
              {activeDownloads.length === 0 && historyTasks.length === 0 ? (
                <div className="text-center py-8 text-[var(--text-muted)] text-sm">
                  No downloads yet
                </div>
              ) : (
                <div className="space-y-2">
                  {activeDownloads.map((task) => (
                    <ActiveDownload key={task.taskId} task={task} onCancel={handleCancel} />
                  ))}
                  {historyTasks.slice(0, 20).map((task) => (
                    <HistoryItem key={task.taskId} task={task} onRetry={handleRetry} getStatusIcon={getStatusIcon} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tab: Local Models */}
          {activeTab === "local" && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <button
                  onClick={handleScanLocal}
                  disabled={isScanning}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-[var(--accent)] text-white text-xs font-medium hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50"
                >
                  {isScanning ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  {isScanning ? "Scanning..." : "Scan Local Models"}
                </button>
                <button
                  onClick={handleOpenDir}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-[var(--bg-tertiary)] border border-[var(--border-color)] text-[var(--text-secondary)] text-xs hover:text-[var(--text-primary)] transition-colors"
                >
                  <FolderOpen size={14} /> Open Download Folder
                </button>
                <span className="text-xs text-[var(--text-muted)]">
                  Directory: {downloadDir}
                </span>
              </div>

              {localModels.length === 0 ? (
                <div className="text-center py-8 text-[var(--text-muted)] text-sm">
                  <Folder size={32} className="mx-auto mb-2 opacity-50" />
                  No local models found. Scan to discover downloaded models.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {localModels.map((model) => (
                    <div
                      key={model.path}
                      className="bg-[var(--bg-tertiary)] rounded-lg p-3 border border-[var(--border-color)]"
                    >
                      <div className="flex items-start justify-between">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{model.name}</p>
                          <p className="text-xs text-[var(--text-muted)] truncate">{model.path}</p>
                        </div>
                        <button
                          onClick={() => handleVerifyModel(model.path)}
                          className={`p-1 rounded ${
                            model.verified ? "text-[var(--success)]" : "text-[var(--text-muted)] hover:text-[var(--accent)]"
                          }`}
                          title={model.verified ? "Verified" : "Verify files"}
                        >
                          <CheckCircle size={14} />
                        </button>
                      </div>
                      <div className="flex gap-3 mt-1.5 text-xs text-[var(--text-muted)]">
                        <span>{model.size_formatted}</span>
                        <span>{model.fileCount} files</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tab: History */}
          {activeTab === "history" && (
            <div>
              {historyTasks.length === 0 ? (
                <div className="text-center py-8 text-[var(--text-muted)] text-sm">
                  No download history yet
                </div>
              ) : (
                <div className="space-y-1">
                  {historyTasks
                    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                    .slice(0, 100)
                    .map((task) => (
                      <HistoryItem key={task.taskId} task={task} onRetry={handleRetry} getStatusIcon={getStatusIcon} />
                    ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Sub-components ── */

function ActiveDownload({
  task, onCancel,
}: {
  task: DownloadTask;
  onCancel: (taskId: string) => void;
}) {
  const remaining = task.downloadSpeed > 0
    ? (task.totalSize - task.downloadedSize) / task.downloadSpeed
    : 0;

  return (
    <div className="bg-[var(--bg-tertiary)] rounded-lg p-4 border border-[var(--border-color)]">
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="flex items-center gap-2">
            <Loader2 size={16} className="text-[var(--info)] animate-spin" />
            <span className="font-medium text-sm">{task.repoId}</span>
            <span className="text-xs text-[var(--text-muted)] bg-[var(--bg-secondary)] px-1.5 py-0.5 rounded">
              {task.source}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-[var(--text-muted)]">
            <span>{formatBytes(task.downloadedSize)} / {formatBytes(task.totalSize || 1)}</span>
            <span>{formatSpeed(task.downloadSpeed)}</span>
            <span>ETA: {formatEta(remaining)}</span>
          </div>
        </div>
        <button onClick={() => onCancel(task.taskId)}
          className="p-1.5 rounded-md hover:bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--error)] transition-colors"
          title="Cancel">
          <XCircle size={16} />
        </button>
      </div>
      <div className="w-full bg-[var(--bg-primary)] rounded-full h-2">
        <div className="bg-[var(--accent)] h-2 rounded-full transition-all duration-500"
          style={{ width: `${Math.max(task.progress, 5)}%` }} />
      </div>
      <p className="text-right text-xs text-[var(--text-muted)] mt-1">{task.progress.toFixed(1)}%</p>
    </div>
  );
}

function HistoryItem({
  task, onRetry, getStatusIcon,
}: {
  task: DownloadTask;
  onRetry: (taskId: string) => void;
  getStatusIcon: (status: string) => React.ReactNode;
}) {
  return (
    <div className="bg-[var(--bg-tertiary)] rounded-lg p-3 border border-[var(--border-color)]">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {getStatusIcon(task.status)}
            <span className="font-medium text-sm truncate">{task.repoId}</span>
            <span className="text-xs text-[var(--text-muted)] bg-[var(--bg-secondary)] px-1.5 py-0.5 rounded">{task.source}</span>
          </div>
          <div className="flex items-center gap-4 mt-0.5 text-xs text-[var(--text-muted)]">
            <span>{formatBytes(task.downloadedSize)} / {formatBytes(task.totalSize)}</span>
            {task.completedAt && <span>{new Date(task.completedAt).toLocaleDateString()}</span>}
            {task.status === "failed" && <span className="text-[var(--error)]">Failed</span>}
          </div>
          {task.status === "failed" && task.error && (
            <p className="mt-0.5 text-xs text-[var(--error)] truncate">{task.error}</p>
          )}
        </div>
        <div className="flex items-center gap-2 ml-4">
          {task.status === "failed" && (
            <button onClick={() => onRetry(task.taskId)}
              className="p-1.5 rounded-md hover:bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors"
              title="Retry">
              <RefreshCw size={14} />
            </button>
          )}
        </div>
      </div>
      {task.progress === 100 && (
        <div className="mt-1.5 w-full bg-[var(--bg-primary)] rounded-full h-1">
          <div className="bg-[var(--success)] h-1 rounded-full" style={{ width: "100%" }} />
        </div>
      )}
    </div>
  );
}
