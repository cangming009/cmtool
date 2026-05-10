export interface ClaudeRecord {
  timestamp: string;
  model: string;
  project: string;
  cwd?: string;
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  total_tokens?: number;
  cost?: number;
  request_id?: string;
  session_id?: string;
}

export interface UsageStats {
  todayInputTokens: number;
  todayOutputTokens: number;
  todayTotalTokens: number;
  todayCost: number;
  todayRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTotalTokens: number;
  totalCost: number;
  totalRequests: number;
  byModel: ModelStat[];
  byProject: ProjectStat[];
  byDate: DateStat[];
  recentRecords: ClaudeRecord[];
}

export interface ModelStat {
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;
  requests: number;
}

export interface ProjectStat {
  project: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;
  requests: number;
}

export interface DateStat {
  date: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;
  requests: number;
}

export interface ScanResult {
  records: ClaudeRecord[];
  errors: string[];
  scannedFiles: number;
  scanTime: number;
}
