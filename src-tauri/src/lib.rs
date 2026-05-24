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

#[derive(Debug, Clone, serde::Serialize)]
struct BridgeStats {
    tx: u64,
    rx: u64,
    credits: i64,
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
async fn scan_wifi(state: tauri::State<'_, AppState>) -> Result<(), String> {
    let mut bridge = state.bridge.lock().await;
    bridge.write_command("SCAN_WIFI").await
}

#[tauri::command]
async fn get_connection_status(state: tauri::State<'_, AppState>) -> Result<bool, String> {
    let bridge = state.bridge.lock().await;
    Ok(bridge.is_connected())
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
                    tokio::time::timeout(tokio::time::Duration::from_millis(10), b.read_line()).await
                };

                match line_result {
                    Ok(Ok(line)) => {
                        if line.is_empty() {
                            eprintln!("[IPC] Received empty line (EOF). Attempting reconnect...");
                            let mut b = bridge.lock().await;
                            b.connect().await.ok(); // Attempt re-init
                            break;
                        }

                        if line.starts_with("TELEMETRY|") {
                            let parts: Vec<&str> = line.split('|').collect();
                            if parts.len() >= 3 {
                                let bytes = parts[1].parse::<u64>().unwrap_or(0);
                                let usec = parts[2].parse::<u64>().unwrap_or(0);
                                let _ = handle.emit("telemetry-event", TelemetryData { bytes, usec });
                            }
                        } else if line.starts_with("MSG|") {
                            let payload = &line[4..]; // Skip "MSG|"
                            
                            if payload.starts_with("BRIDGE_STATS|") {
                                let parts: Vec<&str> = payload.split('|').collect();
                                if parts.len() >= 4 {
                                    let stats = BridgeStats {
                                        tx: parts[1].parse::<u64>().unwrap_or(0),
                                        rx: parts[2].parse::<u64>().unwrap_or(0),
                                        credits: parts[3].parse::<i64>().unwrap_or(0),
                                    };
                                    let _ = handle.emit("bridge-stats-event", stats);
                                }
                            } else if payload.starts_with("WIFI_LIST|") {
                                let list = payload.replace("WIFI_LIST|", "");
                                let ssids: Vec<String> = list.split(',').map(|s| s.trim().to_string()).collect();
                                let _ = handle.emit("wifi-list-event", ssids);
                            }
                        }
                    }
                    Ok(Err(e)) => {
                        eprintln!("[IPC] Read error: {}. Attempting reconnect...", e);
                        break; 
                    }
                    Err(_) => {
                        tokio::task::yield_now().await;
                    }
                }
            }
        }

        tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "linux")]
    std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");

    let bridge: Box<dyn IpcBridge> = if cfg!(target_os = "linux") {
        #[cfg(target_os = "linux")]
        { Box::new(ipc::linux::LinuxBridge::new("/tmp/optifi.sock")) }
        #[cfg(not(target_os = "linux"))]
        { Box::new(MockBridge::new()) }
    } else if cfg!(windows) {
        #[cfg(windows)]
        { Box::new(ipc::windows::WindowsBridge::new(r"\\.\pipe\OptiFiCommandPipe")) }
        #[cfg(not(windows))]
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
            tauri::async_runtime::spawn(async move {
                telemetry_loop(handle, bridge_for_thread).await;
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![set_preset, scan_wifi, get_connection_status])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
