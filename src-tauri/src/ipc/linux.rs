#![cfg(target_os = "linux")]
use async_trait::async_trait;
use super::IpcBridge;
use tokio::net::UnixStream;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

#[cfg_attr(target_os = "linux", allow(dead_code))]
pub struct LinuxBridge {
    reader: Option<BufReader<UnixStream>>,
    path: String,
}

impl LinuxBridge {
    pub fn new(path: &str) -> Self {
        Self {
            reader: None,
            path: path.to_string(),
        }
    }
}

#[async_trait]
impl IpcBridge for LinuxBridge {
    async fn connect(&mut self) -> Result<(), String> {
        let stream = UnixStream::connect(&self.path)
            .await
            .map_err(|e| format!("Failed to connect to unix socket {}: {}", self.path, e))?;
        
        self.reader = Some(BufReader::new(stream));
        Ok(())
    }

    async fn read_line(&mut self) -> Result<String, String> {
        let reader = self.reader.as_mut().ok_or("Not connected")?;
        let mut line = String::new();
        reader.read_line(&mut line).await.map_err(|e| e.to_string())?;
        Ok(line.trim().to_string())
    }

    async fn write_command(&mut self, cmd: &str) -> Result<(), String> {
        let reader = self.reader.as_mut().ok_or("Not connected")?;
        let stream = reader.get_mut();

        let formatted_cmd = if cmd.ends_with('\n') {
            cmd.to_string()
        } else {
            format!("{}\n", cmd)
        };

        stream.write_all(formatted_cmd.as_bytes()).await.map_err(|e| e.to_string())?;
        stream.flush().await.map_err(|e| e.to_string())?;
        Ok(())
    }

    fn is_connected(&self) -> bool {
        self.reader.is_some()
    }
}
