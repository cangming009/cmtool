use serde::{Deserialize, Serialize};
use tauri::State;
use crate::AppState;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DownloadTaskState {
    pub task_id: String,
    pub repo_id: String,
    pub source: String,
    pub status: String,
    pub progress: f64,
    pub total_size: u64,
    pub downloaded_size: u64,
    pub download_speed: f64,
    pub error: String,
    pub created_at: String,
}

#[tauri::command]
pub async fn start_download(
    repo_id: String,
    source: String,
    download_dir: String,
    state: State<'_, AppState>,
) -> Result<DownloadTaskState, String> {
    // Validate repo_id
    if !repo_id.contains('/') || repo_id.split('/').count() != 2 {
        return Err(format!("Invalid model ID: '{}'. Expected format: 'owner/model'", repo_id));
    }

    let task_id = Uuid::new_v4().to_string();
    let task = DownloadTaskState {
        task_id: task_id.clone(),
        repo_id: repo_id.clone(),
        source: source.clone(),
        status: "queued".to_string(),
        progress: 0.0,
        total_size: 0,
        downloaded_size: 0,
        download_speed: 0.0,
        error: String::new(),
        created_at: chrono::Utc::now().to_rfc3339(),
    };

    // Store task
    {
        let mut tasks = state.download_tasks.lock().map_err(|e| e.to_string())?;
        tasks.push(task.clone());
    }

    // Spawn background download task
    let task_id_clone = task_id.clone();
    let repo_id_clone = repo_id.clone();
    let download_dir_clone = download_dir.clone();
    tokio::spawn(async move {
        // In a real implementation, this would use reqwest to download files
        // For now, we simulate the download process
        let download_path = std::path::Path::new(&download_dir_clone).join(
            repo_id_clone.split('/').last().unwrap_or("model")
        );

        // Create download directory
        let _ = std::fs::create_dir_all(&download_path);

        // TODO: Implement actual HTTP download with progress tracking
        // For now, mark as queued - real download will use frontend-based HTTP downloads
        log::info!("Download task {} for {} created", task_id_clone, repo_id_clone);
    });

    Ok(task)
}

#[tauri::command]
pub async fn cancel_download(
    task_id: String,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    let mut tasks = state.download_tasks.lock().map_err(|e| e.to_string())?;
    if let Some(task) = tasks.iter_mut().find(|t| t.task_id == task_id) {
        task.status = "cancelled".to_string();
        Ok(true)
    } else {
        Err(format!("Task not found: {}", task_id))
    }
}

#[tauri::command]
pub async fn get_download_tasks(
    state: State<'_, AppState>,
) -> Result<Vec<DownloadTaskState>, String> {
    let tasks = state.download_tasks.lock().map_err(|e| e.to_string())?;
    Ok(tasks.clone())
}

#[tauri::command]
pub fn get_default_download_dir() -> String {
    if let Some(home) = dirs::home_dir() {
        home.join("cmtool").join("models").to_string_lossy().to_string()
    } else {
        String::from("./cmtool/models")
    }
}
