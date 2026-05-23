use async_trait::async_trait;
use tokio::time::{sleep, Duration};
use super::IpcBridge;
use rand::Rng;

pub struct MockBridge {
    connected: bool,
}

impl MockBridge {
    pub fn new() -> Self {
        Self { connected: false }
    }
}

#[async_trait]
impl IpcBridge for MockBridge {
    async fn connect(&mut self) -> Result<(), String> {
        self.connected = true;
        Ok(())
    }

    async fn read_line(&mut self) -> Result<String, String> {
        if !self.connected {
            return Err("Not connected".into());
        }
        
        // Simulate packet frequency
        sleep(Duration::from_millis(50)).await;
        
        let mut rng = rand::thread_rng();
        let bytes: u64 = rng.gen_range(64..1514);
        let usec: u64 = rng.gen_range(5..50);
        
        Ok(format!("TELEMETRY|{}|{}", bytes, usec))
    }

    async fn write_command(&mut self, cmd: &str) -> Result<(), String> {
        println!("[MOCK] Command received: {}", cmd);
        Ok(())
    }

    fn is_connected(&self) -> bool {
        self.connected
    }
}
