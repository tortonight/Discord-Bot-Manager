# Discord Bot Manager

> A desktop dashboard for managing multiple Discord bots — built with Electron.

![Platform](https://img.shields.io/badge/platform-Windows-blue)
![Electron](https://img.shields.io/badge/Electron-28.x-47848F)
![License](https://img.shields.io/badge/license-MIT-green)

Discord Bot Manager is a desktop application that provides a graphical interface for managing multiple Node.js Discord bots from a single place. Start, stop, restart, monitor resources, edit files, manage backups, and send commands — all from one unified dashboard.

---

## Table of Contents

- [Features](#features)
- [Screenshots](#screenshots)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Usage](#usage)
- [Building](#building)
- [Project Structure](#project-structure)
- [Configuration](#configuration)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## Features

### Dashboard
- **Fleet overview** — Total bots, running count, stopped count, memory usage at a glance
- **Quick actions** — Start All, Stop All, Restart All, Add Bot
- **System resources** — Real-time CPU and memory usage bars

### Bot Management
- **Add/remove bots** — Link any Node.js project directory as a managed bot
- **Auto-detect entry files** — Automatically finds `index.js`, `bot.js`, `main.js`, `app.js`, or `server.js`
- **Auto-restart on crash** — Automatically restarts bots that exit with an error (configurable per bot)
- **Live status cards** — Color-coded status indicators with uptime tracking

### Bot Detail (7 Tabs)

| Tab | Description |
|-----|-------------|
| **Console** | Real-time terminal output (STDOUT/STDERR), send commands via STDIN, auto-scroll toggle |
| **Startup** | Configure entry point, Node arguments, working directory, auto-restart, environment variables |
| **Files** | Full file browser with breadcrumb navigation, create/edit/rename/delete files and folders |
| **Config** | Quick-access editor for `package.json`, `.env`, `config.json` — plus one-click `npm install` |
| **Network** | Manage port bindings and webhook URLs |
| **Schedule** | Create automated tasks (interval-based or cron) — restart, git update, backup, or send command |
| **Backup** — Create ZIP backups, browse existing backups, delete old ones |

### Global Logs
- Aggregated log view across all bots
- Filter by specific bot
- Color-coded log levels (INFO, WARN, ERROR, GIT, NPM, STDIN)

### System Monitoring
- System-wide: CPU load, memory usage, OS info
- Per-bot (when running): CPU percentage and memory usage via process inspection

### UI/UX
- Glassmorphism design with purple accent theme
- Custom title bar with window controls
- Toast notifications, modal dialogs, loading screen
- Responsive sidebar navigation

---

## Screenshots

| Dashboard | Bot Detail (Console) | File Manager |
|-----------|---------------------|--------------|
| Fleet overview with stat cards | Real-time terminal output | Full file browser with breadcrumb |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Electron 28.x |
| Frontend | HTML5 + CSS3 + Vanilla JavaScript |
| Backend | Node.js (built-in modules only) |
| Build | electron-builder 24.x (NSIS installer) |
| UI Theme | Glassmorphism with CSS custom properties |

**Zero production dependencies** — the app uses only Node.js built-in modules (`child_process`, `fs`, `path`, `os`, `events`).

---

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher
- npm (comes with Node.js)
- Windows 10/11 (for building the installer)

---

## Installation

```bash
# Clone the repository
git clone https://github.com/your-username/discord-bot-manager.git
cd discord-bot-manager

# Install dependencies
npm install

# Run in development mode
npm start
```

The app window will open at 1280×780 (minimum 960×600).

---

## Usage

### Adding a Bot

1. Click **"Add Bot"** on the Dashboard or Bots page
2. Select the directory containing your Discord bot's source code
3. The app auto-detects the entry file and adds the bot to your fleet

### Managing Bots

- **Start/Stop/Restart** — Use the buttons on each bot card or in the detail view
- **Send Commands** — Open the Console tab and type commands in the input field
- **Edit Files** — Open the Files tab to browse, create, edit, rename, or delete files
- **Configure** — Open the Startup tab to set entry point, Node args, and environment variables
- **Schedule Tasks** — Open the Schedule tab to create automated restart, update, backup, or command tasks
- **Create Backups** — Open the Backup tab and click "Create Backup Now"

### Global Logs

Navigate to the **Logs** page to see aggregated output from all bots. Use the filter dropdown to view logs from a specific bot.

---

## Building

### Build the Windows Installer

```bash
# Method 1: Using the build script (recommended)
npm run build:exe

# Method 2: Direct electron-builder
npm run pack
```

The build script will:
1. Verify all required files exist
2. Generate a default icon (if `sharp` is available)
3. Install dependencies
4. Run electron-builder to create the NSIS installer

### Output

```
release/
├── Discord Bot Manager Setup 1.0.0.exe   ← NSIS installer
└── win-unpacked/                          ← Portable version
```

The NSIS installer supports:
- Custom installation directory
- Desktop shortcut creation
- User-guided (non-one-click) installation

---

## Project Structure

```
discord-bot-manager/
├── main.js                  # Electron main process — window creation, IPC handlers
├── preload.js               # Secure preload script — exposes APIs via contextBridge
├── bot-manager.js           # Core logic — bot CRUD, process management, file operations,
                            #   backups, scheduling, system stats, config persistence
├── build.js                 # Build script — file verification, icon generation, packaging
├── package.json             # Project config, scripts, electron-builder settings
├── .gitignore               # Git ignore rules
│
├── public/
│   ├── index.html           # Main UI — all pages, modals, loading screen
│   ├── styles.css           # Complete stylesheet — glassmorphism theme, animations
│   └── renderer.js          # Frontend logic — all UI interaction handlers
│
├── build/
│   └── icon.png             # App icon (auto-generated, 256×256)
│
├── bots/
│   └── sample-bot/
│       └── index.js         # Sample bot for testing
│
├── backups/                 # Bot backup storage (runtime)
└── release/                 # Build output
```

---

## Configuration

### Per-Bot Settings

Stored in `%APPDATA%\discord-bot-manager\config.json`:

```json
{
  "bots": [
    {
      "id": "bot_...",
      "name": "my-discord-bot",
      "path": "C:\\path\\to\\bot",
      "entry": "index.js",
      "autoRestart": true,
      "env": {
        "DISCORD_TOKEN": "your-token-here"
      },
      "nodeArgs": "--max-old-space-size=512",
      "schedules": [
        {
          "name": "Daily Restart",
          "type": "interval",
          "interval": 1440,
          "action": "restart",
          "enabled": true
        }
      ],
      "network": {
        "ports": [{ "port": "3000", "description": "Web dashboard" }],
        "webhooks": [{ "url": "https://...", "description": "Alert webhook" }]
      }
    }
  ]
}
```

### App Settings

| Setting | Location | Description |
|---------|----------|-------------|
| Window size | `main.js` | Default: 1280×780, Min: 960×600 |
| App ID | `package.json` | `com.botadmin.manager` |
| Installer | `package.json` | NSIS, user-guided, desktop shortcut |

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| App won't start | Run `npm install` and try `npm start` again |
| Bot fails to start | Check the Console tab for errors; verify the entry file exists |
| Build fails | Ensure no spaces in the project path; check antivirus isn't blocking |
| Bot not appearing | Click "Add Bot" and select the bot's project directory |
| High memory usage in file manager | The file browser loads file stats lazily; large directories may take a moment |

---

## License

This project is licensed under the [MIT License](LICENSE).

---

## Credits

Developed by **Bot Admin** — OWL-assisted development
