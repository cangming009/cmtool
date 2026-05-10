import React, { useEffect, useState } from "react";
import { Download, BarChart3, HardDrive, Clock } from "lucide-react";
import { downloadManager } from "../../services/modelDownload";
import { aggregateUsage } from "../../services/claudeUsage";
import { UsageStats } from "../../services/claudeUsage/types";
import { formatCost, formatTokens } from "../../utils/format";

export default function Dashboard() {
  const [taskStats, setTaskStats] = useState({ total: 0, completed: 0, failed: 0, downloading: 0 });
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);

  useEffect(() => {
    const unsubscribe = downloadManager.subscribe(() => {
      setTaskStats(downloadManager.getTaskStats());
    });
    setTaskStats(downloadManager.getTaskStats());
    return unsubscribe;
  }, []);

  useEffect(() => {
    // Load usage stats from localStorage cache
    try {
      const cached = localStorage.getItem("cmtool-usage-cache");
      if (cached) {
        const parsed = JSON.parse(cached);
        setUsageStats(aggregateUsage(parsed.records || []));
      }
    } catch {
      // No cache available
    }
  }, []);

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-[var(--bg-secondary)] rounded-lg p-4 border border-[var(--border-color)]">
          <div className="flex items-center gap-2 text-[var(--text-secondary)] mb-2">
            <Download size={18} />
            <span className="text-xs font-medium uppercase tracking-wide">Downloads</span>
          </div>
          <p className="text-2xl font-bold">{taskStats.total}</p>
          <div className="flex gap-3 mt-1 text-xs text-[var(--text-muted)]">
            <span>{taskStats.completed} done</span>
            {taskStats.downloading > 0 && <span className="text-[var(--info)]">{taskStats.downloading} active</span>}
            {taskStats.failed > 0 && <span className="text-[var(--error)]">{taskStats.failed} failed</span>}
          </div>
        </div>

        <div className="bg-[var(--bg-secondary)] rounded-lg p-4 border border-[var(--border-color)]">
          <div className="flex items-center gap-2 text-[var(--text-secondary)] mb-2">
            <BarChart3 size={18} />
            <span className="text-xs font-medium uppercase tracking-wide">API Calls</span>
          </div>
          <p className="text-2xl font-bold">{usageStats?.totalRequests || 0}</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            {usageStats?.todayRequests || 0} today
          </p>
        </div>

        <div className="bg-[var(--bg-secondary)] rounded-lg p-4 border border-[var(--border-color)]">
          <div className="flex items-center gap-2 text-[var(--text-secondary)] mb-2">
            <HardDrive size={18} />
            <span className="text-xs font-medium uppercase tracking-wide">Total Tokens</span>
          </div>
          <p className="text-2xl font-bold">
            {formatTokens(usageStats?.totalTotalTokens || 0)}
          </p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            In: {formatTokens(usageStats?.totalInputTokens || 0)} | Out: {formatTokens(usageStats?.totalOutputTokens || 0)}
          </p>
        </div>

        <div className="bg-[var(--bg-secondary)] rounded-lg p-4 border border-[var(--border-color)]">
          <div className="flex items-center gap-2 text-[var(--text-secondary)] mb-2">
            <Clock size={18} />
            <span className="text-xs font-medium uppercase tracking-wide">Estimated Cost</span>
          </div>
          <p className="text-2xl font-bold">{formatCost(usageStats?.totalCost || 0)}</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            {formatCost(usageStats?.todayCost || 0)} today
          </p>
        </div>
      </div>

      {/* Quick actions */}
      <h2 className="text-lg font-semibold mb-3">Quick Actions</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            window.location.hash = "#/model-downloader";
          }}
          className="bg-[var(--bg-secondary)] rounded-lg p-4 border border-[var(--border-color)] hover:border-[var(--accent)] transition-colors block"
        >
          <h3 className="font-medium mb-1">Download a Model</h3>
          <p className="text-sm text-[var(--text-secondary)]">
            Download models from ModelScope or HuggingFace
          </p>
        </a>
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            window.location.hash = "#/claude-usage";
          }}
          className="bg-[var(--bg-secondary)] rounded-lg p-4 border border-[var(--border-color)] hover:border-[var(--accent)] transition-colors block"
        >
          <h3 className="font-medium mb-1">View Claude Usage</h3>
          <p className="text-sm text-[var(--text-secondary)]">
            Check your Claude API token usage and costs
          </p>
        </a>
      </div>
    </div>
  );
}
