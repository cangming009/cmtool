use serde::{Deserialize, Serialize};
use std::sync::Mutex;

mod commands;
use commands::model_download::DownloadTaskState;

pub struct AppState {
    pub download_tasks: Mutex<Vec<DownloadTaskState>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ClaudeUsageRecord {
    pub timestamp: String,
    pub model: String,
    pub project: String,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_creation_input_tokens: u64,
    pub cache_read_input_tokens: u64,
    pub total_tokens: u64,
    pub cost: f64,
    pub session_id: String,
    pub request_id: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UsageStats {
    pub today_input_tokens: u64,
    pub today_output_tokens: u64,
    pub today_total_tokens: u64,
    pub today_cost: f64,
    pub today_requests: u64,
    pub total_input_tokens: u64,
    pub total_output_tokens: u64,
    pub total_total_tokens: u64,
    pub total_cost: f64,
    pub total_requests: u64,
    pub by_model: Vec<ModelStat>,
    pub by_project: Vec<ProjectStat>,
    pub by_date: Vec<DateStat>,
    pub recent_records: Vec<ClaudeUsageRecord>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ModelStat {
    pub model: String,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub total_tokens: u64,
    pub cost: f64,
    pub requests: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProjectStat {
    pub project: String,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub total_tokens: u64,
    pub cost: f64,
    pub requests: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DateStat {
    pub date: String,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub total_tokens: u64,
    pub cost: f64,
    pub requests: u64,
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! Welcome to cmtool.", name)
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .manage(AppState {
            download_tasks: Mutex::new(Vec::new()),
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            commands::model_download::start_download,
            commands::model_download::cancel_download,
            commands::model_download::get_download_tasks,
            commands::model_download::get_default_download_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running cmtool");
}
