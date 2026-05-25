# Windows Build Guide (Frontend)

## 1. Prerequisites
You must install Node.js (v18+) and the Rust toolchain to compile the Tauri frontend natively for Windows.

1. Install **Node.js**: [nodejs.org](https://nodejs.org)
2. Install **Rust**: Download `rustup-init.exe` from [rustup.rs](https://rustup.rs) and follow the default prompts (it will also install the required Visual Studio C++ Build Tools).
3. Ensure WebView2 is installed on your Windows machine (it comes pre-installed on Windows 11).

## 2. Setup
Install all Node modules using `npm`:
```powershell
cd path\to\optifi\frontend
npm install
```

## 3. Development & Building
To run the dashboard in development mode with hot-reloading:
```powershell
npm run tauri dev
```

To compile the final native executable (`.exe`):
```powershell
npm run tauri build
```
