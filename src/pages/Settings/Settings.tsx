import React, { useEffect, useState } from "react";
import { Save, FolderOpen, Trash2 } from "lucide-react";
import { getConfig, updateConfig, AppConfig } from "../../storage/config";
import { clearDownloadHistory } from "../../storage/history";

export default function Settings() {
  const [config, setConfig] = useState<AppConfig>(getConfig());
  const [saved, setSaved] = useState(false);
  const [historyCleared, setHistoryCleared] = useState(false);

  const handleSave = () => {
    updateConfig(config);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleClearHistory = async () => {
    await clearDownloadHistory();
    setHistoryCleared(true);
    setTimeout(() => setHistoryCleared(false), 2000);
  };

  const handleSelectDir = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ directory: true, multiple: false, title: "Select Default Download Directory" });
      if (selected) {
        setConfig((prev) => ({ ...prev, defaultDownloadDir: selected }));
      }
    } catch {
      // Fallback to manual input
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      <div className="space-y-6">
        {/* Download settings */}
        <section className="bg-[var(--bg-secondary)] rounded-lg p-5 border border-[var(--border-color)]">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-secondary)] mb-4">
            Download Settings
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                Default Download Directory
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={config.defaultDownloadDir}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, defaultDownloadDir: e.target.value }))
                  }
                  className="flex-1 px-3 py-2 rounded-md bg-[var(--bg-tertiary)] border border-[var(--border-color)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                />
                <button
                  onClick={handleSelectDir}
                  className="px-3 py-2 rounded-md bg-[var(--bg-tertiary)] border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                >
                  <FolderOpen size={18} />
                </button>
              </div>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Models will be downloaded to subdirectories inside this folder
              </p>
            </div>
          </div>
        </section>

        {/* Data settings */}
        <section className="bg-[var(--bg-secondary)] rounded-lg p-5 border border-[var(--border-color)]">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-secondary)] mb-4">
            Data Management
          </h2>

          <div className="space-y-4">
            <div>
              <button
                onClick={handleClearHistory}
                className="flex items-center gap-2 px-4 py-2 rounded-md bg-red-900/30 border border-red-800 text-sm text-[var(--error)] hover:bg-red-900/50 transition-colors"
              >
                <Trash2 size={16} />
                Clear Download History
              </button>
              {historyCleared && (
                <p className="mt-1 text-xs text-[var(--success)]">Download history cleared</p>
              )}
            </div>
          </div>
        </section>

        {/* Pricing info */}
        <section className="bg-[var(--bg-secondary)] rounded-lg p-5 border border-[var(--border-color)]">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-secondary)] mb-4">
            Pricing Configuration
          </h2>
          <p className="text-sm text-[var(--text-secondary)] mb-2">
            Claude API pricing is built-in and covers the latest models. Costs shown are estimates.
          </p>
          <p className="text-xs text-[var(--text-muted)]">
            Supported models: Claude Opus 4.5/4.6/4.7, Sonnet 4/4.5/4.6, Haiku 4.5, GPT-4o
          </p>
        </section>

        {/* About */}
        <section className="bg-[var(--bg-secondary)] rounded-lg p-5 border border-[var(--border-color)]">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-secondary)] mb-4">
            About cmtool
          </h2>
          <div className="text-sm text-[var(--text-secondary)] space-y-1">
            <p>Version: 1.0.0</p>
            <p>Built with Tauri + React + TypeScript</p>
            <p className="text-xs text-[var(--text-muted)] mt-2">
              cmtool - Desktop tool for model downloading and Claude usage statistics
            </p>
          </div>
        </section>

        {/* Save button */}
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-[var(--accent)] text-white text-sm font-medium hover:bg-[var(--accent-hover)] transition-colors"
          >
            <Save size={16} />
            Save Settings
          </button>
        </div>
        {saved && (
          <p className="text-right text-xs text-[var(--success)]">Settings saved</p>
        )}
      </div>
    </div>
  );
}
