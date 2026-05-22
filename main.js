const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const BotManager = require('./bot-manager');

let mainWindow;
let botManager;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 780,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#0a0a1a',
    show: false,
    center: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'public', 'index.html'));

  mainWindow.webContents.on('did-finish-load', () => {
    if (!mainWindow) return;
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.webContents.on('did-fail-load', (_, code, desc) => {
    console.error('Page load failed:', code, desc);
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  const userDataPath = app.getPath('userData');
  botManager = new BotManager(userDataPath);
  createWindow();

  ipcMain.handle('window:minimize', () => mainWindow?.minimize());
  ipcMain.handle('window:maximize', () => {
    if (!mainWindow) return;
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  });
  ipcMain.handle('window:close', () => mainWindow?.close());

  ipcMain.handle('bots:list', () => botManager.list());
  ipcMain.handle('bots:start', (_, id) => botManager.start(id));
  ipcMain.handle('bots:stop', (_, id) => botManager.stop(id));
  ipcMain.handle('bots:restart', (_, id) => botManager.restart(id));
  ipcMain.handle('bots:stdin', (_, id, input) => botManager.sendStdin(id, input));
  ipcMain.handle('bots:update', async (_, id) => await botManager.update(id));
  ipcMain.handle('bots:settings', (_, id) => botManager.getSettings(id));
  ipcMain.handle('bots:save-settings', (_, id, s) => botManager.saveSettings(id, s));
  ipcMain.handle('bots:logs', (_, id) => botManager.getLogs(id));

  ipcMain.handle('bots:add', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Select Bot Directory',
    });
    if (!result.canceled && result.filePaths.length > 0) {
      return botManager.addBot(result.filePaths[0]);
    }
    return null;
  });
  ipcMain.handle('bots:remove', (_, id) => botManager.removeBot(id));

  ipcMain.handle('files:list', (_, id, dir) => botManager.readDirectory(id, dir || ''));
  ipcMain.handle('files:read', (_, id, fp) => botManager.readFile(id, fp));
  ipcMain.handle('files:write', (_, id, fp, c) => botManager.writeFile(id, fp, c));
  ipcMain.handle('files:create', (_, id, fp) => botManager.createFile(id, fp));
  ipcMain.handle('files:mkdir', (_, id, dp) => botManager.createDirectory(id, dp));
  ipcMain.handle('files:delete', (_, id, fp) => botManager.deleteItem(id, fp));
  ipcMain.handle('files:rename', (_, id, o, n) => botManager.renameItem(id, o, n));

  ipcMain.handle('backup:create', async (_, id) => await botManager.createBackup(id));
  ipcMain.handle('backup:list', (_, id) => botManager.listBackups(id));
  ipcMain.handle('backup:delete', (_, id, n) => botManager.deleteBackup(id, n));

  ipcMain.handle('bot:npm-install', async (_, id) => await botManager.runNpmInstall(id));
  ipcMain.handle('system:stats', () => botManager.getSystemStats());
  ipcMain.handle('system:bot-stats', async (_, id) => await botManager.getBotSystemStats(id));

  botManager.on('statusChange', (data) => {
    if (mainWindow) mainWindow.webContents.send('bot:status-changed', data);
  });
  botManager.on('log', (data) => {
    if (mainWindow) mainWindow.webContents.send('bot:log', data);
  });
});

app.on('window-all-closed', () => {
  botManager?.shutdown();
  app.quit();
});

app.on('activate', () => {
  if (!mainWindow) createWindow();
});
