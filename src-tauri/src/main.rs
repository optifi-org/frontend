// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod ipc;

use ipc::{IpcBridge, TelemetryData};
use ipc::mock::MockBridge;
#[cfg(windows)]
use ipc::windows::WindowsBridge;

use tauri::{AppHandle, Emitter};
use std::sync::Arc;
use tokio::sync::Mutex;

struct AppState {
    bridge: Arc<Mutex<Box<dyn IpcBridge>>>,
}

#[tauri::command]
async fn set_preset(state: tauri::State<'_, AppState>, preset: String) -> Result<(), String> {
    let mut bridge = state.bridge.lock().await;
    let command = match preset.as_str() {
        "PERFORMANCE" => "SET_PERFORMANCE",
        "BATTERY" => "SET_BATTERY",
        "BALANCED" => "SET_BALANCED",
        _ => return Err("Invalid preset".to_string()),
    };
    bridge.write_command(command).await
}

#[tauri::command]
async fn get_connection_status(state: tauri::State<'_, AppState>) -> Result<bool, String> {
    let bridge = state.bridge.lock().await;
    Ok(bridge.is_connected())
}

fn main() {
    #[cfg(target_os = "linux")]
    std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");

    let use_mock = std::env::var("OPTIFI_MOCK").is_ok() || cfg!(debug_assertions);

    // Select the appropriate bridge based on the OS
    let bridge: Box<dyn IpcBridge> = if use_mock && !cfg!(windows) {
        // Use Mock on non-Windows dev environments by default
        Box::new(MockBridge::new())
    } else if cfg!(windows) {
        #[cfg(windows)]
        { Box::new(WindowsBridge::new(r"\\.\pipe\OptiFiCommandPipe")) }
        #[cfg(not(windows))]
        { Box::new(MockBridge::new()) }
    } else if cfg!(target_os = "linux") {
        #[cfg(target_os = "linux")]
        { Box::new(ipc::linux::LinuxBridge::new("/tmp/optifi.sock")) }
        #[cfg(not(target_os = "linux"))]
        { Box::new(MockBridge::new()) }
    } else {
        Box::new(MockBridge::new())
    };

    let bridge_arc = Arc::new(Mutex::new(bridge));
    let bridge_for_thread = Arc::clone(&bridge_arc);

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState { bridge: bridge_arc })
        .setup(move |app| {
            let handle = app.handle().clone();
            
            // Spawn the background telemetry loop using Tauri's internal runtime
            tauri::async_runtime::spawn(async move {
                telemetry_loop(handle, bridge_for_thread).await;
            });
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![set_preset, get_connection_status])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

async fn telemetry_loop(handle: AppHandle, bridge: Arc<Mutex<Box<dyn IpcBridge>>>) {
    loop {
        let mut connected = false;
        {
            let mut b = bridge.lock().await;
            if !b.is_connected() {
                if let Err(e) = b.connect().await {
                    eprintln!("[IPC] Connection failed: {}. Retrying in 5s...", e);
                } else {
                    println!("[IPC] Connected to Core Engine.");
                    connected = true;
                }
            } else {
                connected = true;
            }
        }

        if connected {
            loop {
                let line_result = {
                    let mut b = bridge.lock().await;
                    b.read_line().await
                };

                match line_result {
                    Ok(line) => {
                        if line.starts_with("TELEMETRY|") {
                            let parts: Vec<&str> = line.split('|').collect();
                            if parts.len() == 3 {
                                let bytes = parts[1].parse::<u64>().unwrap_or(0);
                                let usec = parts[2].parse::<u64>().unwrap_or(0);
                                
                                let data = TelemetryData { bytes, usec };
                                let _ = handle.emit("telemetry-event", data);
                            }
                        }
                    }
                    Err(e) => {
                        eprintln!("[IPC] Read error: {}. Attempting reconnect...", e);
                        break; // Break inner loop to trigger reconnect
                    }
                }
            }
        }

        tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
    }
}
