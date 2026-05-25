# Arch Linux Build Guide (Frontend)

## 1. Prerequisites
You must install Node.js (v18+), the Rust toolchain, and the Tauri Linux development headers.

```bash
# Install Tauri Linux dependencies
sudo pacman -Syu
sudo pacman -S webkit2gtk base-devel curl wget openssl appmenu-gtk-module gtk3 libappindicator-gtk3 librsvg libvips

# Install Rust
sudo pacman -S rustup
rustup default stable
```

Ensure Node.js and NPM are also installed:
```bash
sudo pacman -S nodejs npm
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
