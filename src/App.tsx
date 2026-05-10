import React, { useState } from "react";
import { Download, BarChart3, Settings, LayoutDashboard, X } from "lucide-react";
import Dashboard from "./pages/Dashboard/Dashboard";
import ModelDownloader from "./pages/ModelDownloader/ModelDownloader";
import ClaudeUsage from "./pages/ClaudeUsage/ClaudeUsage";
import SettingsPage from "./pages/Settings/Settings";

type Page = "dashboard" | "model-downloader" | "claude-usage" | "settings";

const navItems: { id: Page; label: string; icon: React.ReactNode }[] = [
  { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={20} /> },
  { id: "model-downloader", label: "Model Downloader", icon: <Download size={20} /> },
  { id: "claude-usage", label: "Claude Usage", icon: <BarChart3 size={20} /> },
  { id: "settings", label: "Settings", icon: <Settings size={20} /> },
];

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const renderPage = () => {
    switch (currentPage) {
      case "dashboard":
        return <Dashboard />;
      case "model-downloader":
        return <ModelDownloader />;
      case "claude-usage":
        return <ClaudeUsage />;
      case "settings":
        return <SettingsPage />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="flex h-full w-full">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? "w-56" : "w-0"
        } transition-all duration-200 bg-[var(--bg-secondary)] border-r border-[var(--border-color)] overflow-hidden flex-shrink-0`}
      >
        <div className="p-4">
          <h1 className="text-lg font-bold text-[var(--text-primary)] tracking-tight">
            cmtool
          </h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Model & Usage Tool
          </p>
        </div>
        <nav className="flex flex-col gap-0.5 px-2">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setCurrentPage(item.id)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
                currentPage === item.id
                  ? "bg-[var(--accent)] text-white"
                  : "text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto bg-[var(--bg-primary)]">
        <div className="flex items-center justify-between px-6 py-3 border-b border-[var(--border-color)] bg-[var(--bg-secondary)]">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            {sidebarOpen ? <X size={18} /> : <LayoutDashboard size={18} />}
          </button>
          <span className="text-xs text-[var(--text-muted)]">
            {navItems.find((n) => n.id === currentPage)?.label}
          </span>
        </div>
        <div className="p-6">{renderPage()}</div>
      </main>
    </div>
  );
}
