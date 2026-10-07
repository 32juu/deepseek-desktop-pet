//! DeepSeek 蓝色大肥鱼 · 桌面客户端（Tauri 壳）
//!
//! 职责边界（见 docs/architecture.md 第 2 节）：
//!   - 本进程只负责**窗口与本地集成**：桌宠窗口、托盘、置顶/穿透、后端进程守护。
//!   - **不放任何业务逻辑与统计计算**。所有学习数据、统计、AI 调用都走后端 REST/SSE。
//!
//! 当前阶段（Phase 1）只提供后端地址查询；后端进程托管（sidecar）在 Phase 2 落地。

/// 后端服务基地址。
///
/// 目前后端由开发者手动启动并固定监听 18080（见 docs/architecture.md 第 2 节的阶段规划）。
/// 将来改为 sidecar 托管时，这里改成读取握手文件 runtime.json（port + 一次性 token）。
#[tauri::command]
fn backend_base_url() -> String {
    "http://127.0.0.1:18080".to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![backend_base_url])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
