# Ubuntu / Debian Build Guide (Frontend)

## 1. Prerequisites
You must install Node.js (v18+), the Rust toolchain, and the Tauri Linux development headers.

```bash
# Install Tauri Linux dependencies
sudo apt update
sudo apt install libwebkit2gtk-4.0-dev build-essential curl wget file libssl-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev

# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Ensure Node.js and NPM are also installed:
```bash
sudo apt install nodejs npm
```

## 2. Setup
Install project dependencies:
```bash
npm install
```

## 3. Development & Building
Launch the development server with hot-reloading:
```bash
npm run tauri dev
```
*Note: Make sure the `core-engine` daemon is running in the background, otherwise the UI will show "Searching for Engine...".*

To compile the standalone desktop application binary:
```bash
npm run tauri build
```
