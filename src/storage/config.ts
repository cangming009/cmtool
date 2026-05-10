export interface AppConfig {
  defaultDownloadDir: string;
  theme: "dark" | "light";
}

const DEFAULT_CONFIG: AppConfig = {
  defaultDownloadDir: "~/cmtool/models",
  theme: "dark",
};

let config: AppConfig = { ...DEFAULT_CONFIG };

function getConfigPath(): string {
  return "cmtool-config.json";
}

export function getConfig(): AppConfig {
  return { ...config };
}

export function updateConfig(updates: Partial<AppConfig>): AppConfig {
  config = { ...config, ...updates };
  saveConfig().catch(() => {});
  return getConfig();
}

export async function loadConfig(): Promise<AppConfig> {
  try {
    const stored = localStorage.getItem(getConfigPath());
    if (stored) {
      const parsed = JSON.parse(stored);
      config = { ...DEFAULT_CONFIG, ...parsed };
    }
  } catch {
    config = { ...DEFAULT_CONFIG };
  }
  return getConfig();
}

async function saveConfig(): Promise<void> {
  try {
    localStorage.setItem(getConfigPath(), JSON.stringify(config));
  } catch {
    // Silently fail
  }
}
