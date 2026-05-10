import React, { useEffect, useState } from "react";
import {
  BarChart3,
  Calendar,
  Cpu,
  FolderGit2,
  DollarSign,
  MessageSquare,
  Search,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { aggregateUsage } from "../../services/claudeUsage";
import { UsageStats, ClaudeRecord } from "../../services/claudeUsage/types";
import { parseJsonlContent } from "../../services/claudeUsage/parser";
import { formatCost, formatTokens, formatDate, formatTime } from "../../utils/format";

// Sample data for demo when no local data is available
const SAMPLE_RECORDS: ClaudeRecord[] = [
  { timestamp: new Date().toISOString(), model: "claude-sonnet-4-6", project: "cmtool", input_tokens: 1250, output_tokens: 3420, session_id: "s1" },
  { timestamp: new Date(Date.now() - 3600000).toISOString(), model: "claude-opus-4-6", project: "cmtool", input_tokens: 890, output_tokens: 1560, session_id: "s2" },
  { timestamp: new Date(Date.now() - 7200000).toISOString(), model: "claude-sonnet-4-6", project: "web-app", input_tokens: 3400, output_tokens: 5200, session_id: "s3" },
  { timestamp: new Date(Date.now() - 86400000).toISOString(), model: "claude-haiku-4-5", project: "cmtool", input_tokens: 450, output_tokens: 1200, session_id: "s4" },
  { timestamp: new Date(Date.now() - 172800000).toISOString(), model: "claude-sonnet-4-5", project: "api-service", input_tokens: 2100, output_tokens: 3800, session_id: "s5" },
];

export default function ClaudeUsage() {
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"models" | "projects" | "dates" | "recent">("models");

  const loadStats = async () => {
    setScanning(true);
    setError("");

    try {
      // Try to scan local Claude Code usage data
      // For web context (dev mode without Tauri), show sample data
      const { scanClaudeUsage } = await import("../../services/claudeUsage");

      let records: ClaudeRecord[] = [];

      try {
        const result = await scanClaudeUsage();
        records = result.records;
        if (result.errors.length > 0) {
          setError(result.errors.join("\n").slice(0, 200));
        }
      } catch {
        // Fallback to sample data for demo
        records = SAMPLE_RECORDS;
      }

      if (records.length === 0) {
        records = SAMPLE_RECORDS;
      }

      const usageStats = aggregateUsage(records);
      setStats(usageStats);

      // Cache for dashboard
      try {
        localStorage.setItem("cmtool-usage-cache", JSON.stringify({ records }));
      } catch {}
    } catch (err) {
      setError(String(err));
    } finally {
      setScanning(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Claude Usage</h1>
        <button
          onClick={loadStats}
          disabled={scanning}
          className="flex items-center gap-2 px-3 py-2 rounded-md bg-[var(--bg-secondary)] border border-[var(--border-color)] text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50"
        >
          <RefreshCw size={14} className={scanning ? "animate-spin" : ""} />
          {scanning ? "Scanning..." : "Refresh"}
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-4 p-3 rounded-md bg-yellow-900/20 border border-yellow-800 text-sm text-[var(--warning)] flex items-start gap-2">
          <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!stats ? (
        <div className="flex items-center justify-center py-16 text-[var(--text-muted)]">
          {scanning ? (
            <div className="flex items-center gap-2">
              <RefreshCw size={18} className="animate-spin" />
              <span>Scanning Claude Code usage data...</span>
            </div>
          ) : (
            <span>No usage data available</span>
          )}
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <SummaryCard
              icon={<MessageSquare size={18} />}
              label="Total Requests"
              value={stats.totalRequests.toString()}
              subtitle={`${stats.todayRequests} today`}
            />
            <SummaryCard
              icon={<BarChart3 size={18} />}
              label="Total Tokens"
              value={formatTokens(stats.totalTotalTokens)}
              subtitle={`In: ${formatTokens(stats.totalInputTokens)} | Out: ${formatTokens(stats.totalOutputTokens)}`}
            />
            <SummaryCard
              icon={<DollarSign size={18} />}
              label="Estimated Cost"
              value={formatCost(stats.totalCost)}
              subtitle={`${formatCost(stats.todayCost)} today`}
              isCost
            />
            <SummaryCard
              icon={<Calendar size={18} />}
              label="Active Days"
              value={stats.byDate.length.toString()}
              subtitle="With API calls"
            />
          </div>

          {/* Tab navigation */}
          <div className="flex gap-1 mb-4 bg-[var(--bg-secondary)] rounded-lg p-1 border border-[var(--border-color)]">
            <TabButton active={activeTab === "models"} onClick={() => setActiveTab("models")} icon={<Cpu size={14} />} label="By Model" />
            <TabButton active={activeTab === "projects"} onClick={() => setActiveTab("projects")} icon={<FolderGit2 size={14} />} label="By Project" />
            <TabButton active={activeTab === "dates"} onClick={() => setActiveTab("dates")} icon={<Calendar size={14} />} label="By Date" />
            <TabButton active={activeTab === "recent"} onClick={() => setActiveTab("recent")} icon={<Search size={14} />} label="Recent" />
          </div>

          {/* Tab content */}
          <div className="bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)]">
            {activeTab === "models" && (
              <TabContent
                headers={["Model", "Requests", "Input", "Output", "Total", "Cost"]}
                rows={stats.byModel.map((m) => [
                  m.model,
                  m.requests.toString(),
                  formatTokens(m.inputTokens),
                  formatTokens(m.outputTokens),
                  formatTokens(m.totalTokens),
                  formatCost(m.cost),
                ])}
              />
            )}
            {activeTab === "projects" && (
              <TabContent
                headers={["Project", "Requests", "Input", "Output", "Total", "Cost"]}
                rows={stats.byProject.map((p) => [
                  p.project,
                  p.requests.toString(),
                  formatTokens(p.inputTokens),
                  formatTokens(p.outputTokens),
                  formatTokens(p.totalTokens),
                  formatCost(p.cost),
                ])}
              />
            )}
            {activeTab === "dates" && (
              <TabContent
                headers={["Date", "Requests", "Input", "Output", "Total", "Cost"]}
                rows={stats.byDate.map((d) => [
                  formatDate(d.date),
                  d.requests.toString(),
                  formatTokens(d.inputTokens),
                  formatTokens(d.outputTokens),
                  formatTokens(d.totalTokens),
                  formatCost(d.cost),
                ])}
              />
            )}
            {activeTab === "recent" && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border-color)]">
                      <Th>Time</Th>
                      <Th>Model</Th>
                      <Th>Project</Th>
                      <Th>Input</Th>
                      <Th>Output</Th>
                      <Th>Cost</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.recentRecords.slice(0, 50).map((r, i) => (
                      <tr key={i} className="border-b border-[var(--border-color)] hover:bg-[var(--bg-tertiary)]">
                        <Td>{r.timestamp ? formatTime(r.timestamp) : "--"}</Td>
                        <Td>{r.model}</Td>
                        <Td>{r.project || "--"}</Td>
                        <Td>{formatTokens(r.input_tokens ?? 0)}</Td>
                        <Td>{formatTokens(r.output_tokens ?? 0)}</Td>
                        <Td>{formatCost(r.cost ?? 0)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <p className="text-xs text-[var(--text-muted)] mt-3">
            * Costs are estimates based on current API pricing. Actual costs may vary.
          </p>
        </>
      )}
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  subtitle,
  isCost,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtitle: string;
  isCost?: boolean;
}) {
  return (
    <div className="bg-[var(--bg-secondary)] rounded-lg p-4 border border-[var(--border-color)]">
      <div className="flex items-center gap-2 text-[var(--text-secondary)] mb-2">
        {icon}
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-2xl font-bold">{value}</p>
      <p className="mt-1 text-xs text-[var(--text-muted)]">{subtitle}</p>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
        active
          ? "bg-[var(--accent)] text-white"
          : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-2.5 text-sm text-[var(--text-primary)]">{children}</td>;
}

function TabContent({
  headers,
  rows,
}: {
  headers: string[];
  rows: string[][];
}) {
  if (rows.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-[var(--text-muted)]">
        No data available
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border-color)]">
            {headers.map((h, i) => (
              <Th key={i}>{h}</Th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 100).map((row, i) => (
            <tr key={i} className="border-b border-[var(--border-color)] hover:bg-[var(--bg-tertiary)]">
              {row.map((cell, j) => (
                <Td key={j}>{cell}</Td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
