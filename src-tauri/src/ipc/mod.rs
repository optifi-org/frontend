use async_trait::async_trait;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelemetryData {
    pub bytes: u64,
    pub usec: u64,
}

#[async_trait]
pub trait IpcBridge: Send + Sync {
    /// Attempt to connect to the core engine.
    async fn connect(&mut self) -> Result<(), String>;
    
    /// Read a single line from the IPC stream.
    async fn read_line(&mut self) -> Result<String, String>;
    
    /// Send a command string to the core engine.
    async fn write_command(&mut self, cmd: &str) -> Result<(), String>;

    /// Check if the current bridge is connected.
    fn is_connected(&self) -> bool;
}

#[cfg(windows)]
pub mod windows;
#[cfg(target_os = "linux")]
pub mod linux;
pub mod mock;
