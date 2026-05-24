#![cfg(windows)]
use async_trait::async_trait;
use super::IpcBridge;
use tokio::net::windows::named_pipe::{ClientOptions, NamedPipeClient};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

pub struct WindowsBridge {
    reader: Option<BufReader<NamedPipeClient>>,
    path: String,
}

impl WindowsBridge {
    pub fn new(path: &str) -> Self {
        Self {
            reader: None,
            path: path.to_string(),
        }
    }
}

#[async_trait]
impl IpcBridge for WindowsBridge {
    async fn connect(&mut self) -> Result<(), String> {
        let client = ClientOptions::new()
            .open(&self.path)
            .map_err(|e| format!("Failed to connect to named pipe {}: {}", self.path, e))?;
        
        self.reader = Some(BufReader::new(client));
        Ok(())
    }

    async fn read_line(&mut self) -> Result<String, String> {
        let reader = self.reader.as_mut().ok_or("Not connected")?;
        let mut line = String::new();
        let bytes = reader.read_line(&mut line).await.map_err(|e| e.to_string())?;
        if bytes == 0 {
            return Err("EOF".to_string());
        }
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
