use async_trait::async_trait;
use tokio::time::{sleep, Duration};
use super::IpcBridge;
use rand::Rng;

pub struct MockBridge {
    connected: bool,
    tx: u64,
    rx: u64,
}

impl MockBridge {
    pub fn new() -> Self {
        Self { connected: false, tx: 0, rx: 0 }
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
        self.tx += rng.gen_range(1..5);
        self.rx += rng.gen_range(1..5);
        if self.tx % 5 == 0 {
            return Ok(format!("MSG|BRIDGE_STATS|{}|{}|{}", self.tx, self.rx, 31));
        }

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
