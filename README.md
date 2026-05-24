# OptiFi Frontend

The OptiFi Frontend is a real-time, hardware-accelerated dashboard that interfaces with the OptiFi Core Engine. It provides live telemetry, dynamic latency graphing, and bridging controls using a premium, high-frequency (20Hz) UI.

It is built as a native OS desktop application using **Tauri v2** (Rust) and **React** (Vite + TypeScript + Tailwind CSS + Framer Motion).

## Prerequisites & System Requirements

Because the frontend uses Tauri, it compiles to a lightweight native binary using Rust while utilizing native OS webview libraries for the UI.

### 1. General Requirements
- **Node.js**: v18.x or newer
- **Package Manager**: `npm` (or `yarn`/`pnpm`)
- **Rust Toolchain**: `rustc` and `cargo`

### 2. Linux-Specific Dependencies
To compile the native Tauri shell on Linux (Debian/Ubuntu), you must install the following development headers:

```bash
# Update package lists
sudo apt update

# Install Tauri prerequisites
sudo apt install libwebkit2gtk-4.0-dev \
    build-essential \
    curl \
    wget \
    file \
    libssl-dev \
    libgtk-3-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev
```

*(For Arch Linux or Fedora instructions, refer to the [official Tauri prerequisites guide](https://tauri.app/v1/guides/getting-started/prerequisites#setting-up-linux).)*

## Installation & Setup

1. **Install Node modules:**
   ```bash
   npm install
   ```

2. **Run in Development Mode:**
   This will launch the Vite development server and the native Tauri window with hot-reloading enabled.
   ```bash
   npm run tauri dev
   ```
   > **Note:** The frontend relies on IPC communication with the `core-engine`. Ensure the Core Engine daemon is running in the background, or the dashboard will display as "Searching for Engine..." / "Offline".

3. **Build for Production:**
   To compile the final standalone native desktop executable:
   ```bash
   npm run tauri build
   ```
   The compiled binaries will be located inside `src-tauri/target/release/`.
