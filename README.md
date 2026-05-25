# OptiFi Frontend

The OptiFi Frontend is a real-time, hardware-accelerated dashboard that interfaces with the OptiFi Core Engine. It provides live telemetry, dynamic latency graphing, and bridging controls using a premium, high-frequency (20Hz) UI.

It is built as a native OS desktop application using **Tauri v2** (Rust) and **React** (Vite + TypeScript + Tailwind CSS + Framer Motion).

## 📚 OS-Specific Build Guides
To compile and run the Frontend application, please refer to the specific setup instructions for your operating system:
- [Ubuntu / Debian](docs/UBUNTU.md)
- [Arch Linux](docs/ARCH.md)
- [Windows](docs/WINDOWS.md)

---

## 🏗️ Architectural Overview & Modules

The frontend is architected as a thin native client (Tauri) that safely bridges kernel-level IPC data directly into a high-performance React view using a custom Event loop.

### 1. IPC Telemetry Listener (`src-tauri/src/main.rs`)
**Why it was implemented:** The Core Engine is a C++ daemon running as root, while the GUI runs in user space. They must communicate securely.
**Signatures & Logic:**
- Spawns a background Rust thread that connects to the Unix Domain Socket at `/tmp/optifi.sock`.
- Asynchronously reads incoming `BRIDGE_STATS|tx_bytes|rx_bytes|credits` pipe-delimited strings.
- Parses the strings and emits Tauri App Handle events (`engine-stats`) to the frontend window, ensuring that potentially dangerous system data is sanitized before reaching the Chromium webview.

### 2. Real-Time UI (`src/App.tsx` & React Ecosystem)
**Why it was implemented:** Traditional React re-renders are too slow for networking telemetry. We need a dynamic dashboard capable of drawing at 20Hz without dropping frames.
**Signatures & Logic:**
- `listen("engine-stats", ...)`: Subscribes to the Tauri Rust events.
- **Micro-batching State Updates:** Integrates a state-batching queue to prevent the UI from thrashing when the core engine blasts telemetry at 50ms intervals.
- Uses **Framer Motion** for GPU-accelerated spring animations on the latency gauges.
- Implements custom chart components using HTML Canvas instead of heavy SVG libraries to maintain 60 FPS while drawing thousands of data points.

## 🚀 Running in Development
Assuming dependencies are installed (see OS guides):
```bash
npm install
npm run tauri dev
```
