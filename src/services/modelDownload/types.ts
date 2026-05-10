export type DownloadSource = "ModelScope" | "HuggingFace" | "All";

export type DownloadStatus =
  | "waiting"
  | "downloading"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

export interface DownloadTask {
  taskId: string;
  repoId: string;
  source: DownloadSource;
  status: DownloadStatus;
  progress: number;
  totalSize: number;
  downloadedSize: number;
  downloadSpeed: number;
  error: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  retryCount: number;
  downloadDir: string;
}

export interface SearchResult {
  repo_id: string;
  name: string;
  downloads: number;
  likes: number;
  size: number;
  size_formatted: string;
  source: DownloadSource;
  description?: string;
  updated_at?: string;
}

export interface ModelFile {
  name: string;
  size: number;
  size_formatted: string;
  hash?: string;
}

export interface ModelInfo {
  repo_id: string;
  name: string;
  description: string;
  model_card: string;
  files: ModelFile[];
  tags: string[];
  pipeline_tag: string;
  size: number;
  size_formatted: string;
  downloads: number;
  likes: number;
  source: DownloadSource;
  created_at?: string;
  updated_at?: string;
}

export interface LocalModel {
  name: string;
  path: string;
  size: number;
  size_formatted: string;
  fileCount: number;
  lastModified: string;
  source?: DownloadSource;
  verified: boolean;
}
