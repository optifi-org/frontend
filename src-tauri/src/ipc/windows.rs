#![cfg(windows)]
use async_trait::async_trait;
use super::IpcBridge;
use interprocess::os::windows::named_pipe::tokio::DuplexBytePipeStream;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

pub struct WindowsBridge {
    stream: Option<BufReader<DuplexBytePipeStream>>,
    path: String,
}

impl WindowsBridge {
    pub fn new(path: &str) -> Self {
        Self {
            stream: None,
            path: path.to_string(),
        }
    }
}

#[async_trait]
impl IpcBridge for WindowsBridge {
    async fn connect(&mut self) -> Result<(), String> {
        let stream = DuplexBytePipeStream::connect(&self.path)
            .await
            .map_err(|e| format!("Failed to connect to named pipe {}: {}", self.path, e))?;
        
        self.stream = Some(BufReader::new(stream));
        Ok(())
    }

    async fn read_line(&mut self) -> Result<String, String> {
        let reader = self.stream.as_mut().ok_or("Not connected")?;
        let mut line = String::new();
        reader.read_line(&mut line).await.map_err(|e| e.to_string())?;
        Ok(line.trim().to_string())
    }

    async fn write_command(&mut self, cmd: &str) -> Result<(), String> {
        let reader = self.stream.as_mut().ok_or("Not connected")?;
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
        self.stream.is_some()
    }
}
