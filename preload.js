const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
  },
  bots: {
    list: () => ipcRenderer.invoke('bots:list'),
    start: (id) => ipcRenderer.invoke('bots:start', id),
    stop: (id) => ipcRenderer.invoke('bots:stop', id),
    restart: (id) => ipcRenderer.invoke('bots:restart', id),
    stdin: (id, input) => ipcRenderer.invoke('bots:stdin', id, input),
    update: (id) => ipcRenderer.invoke('bots:update', id),
    settings: (id) => ipcRenderer.invoke('bots:settings', id),
    saveSettings: (id, s) => ipcRenderer.invoke('bots:save-settings', id, s),
    logs: (id) => ipcRenderer.invoke('bots:logs', id),
    add: () => ipcRenderer.invoke('bots:add'),
    remove: (id) => ipcRenderer.invoke('bots:remove', id),
    npmInstall: (id) => ipcRenderer.invoke('bot:npm-install', id),
  },
  files: {
    list: (id, dir) => ipcRenderer.invoke('files:list', id, dir || ''),
    read: (id, fp) => ipcRenderer.invoke('files:read', id, fp),
    write: (id, fp, c) => ipcRenderer.invoke('files:write', id, fp, c),
    create: (id, fp) => ipcRenderer.invoke('files:create', id, fp),
    mkdir: (id, dp) => ipcRenderer.invoke('files:mkdir', id, dp),
    delete: (id, fp) => ipcRenderer.invoke('files:delete', id, fp),
    rename: (id, o, n) => ipcRenderer.invoke('files:rename', id, o, n),
  },
  backup: {
    create: (id) => ipcRenderer.invoke('backup:create', id),
    list: (id) => ipcRenderer.invoke('backup:list', id),
    delete: (id, n) => ipcRenderer.invoke('backup:delete', id, n),
  },
  system: {
    stats: () => ipcRenderer.invoke('system:stats'),
    botStats: (id) => ipcRenderer.invoke('system:bot-stats', id),
  },
  onBotStatusChange: (callback) => {
    ipcRenderer.on('bot:status-changed', (_, data) => callback(data));
  },
  onBotLog: (callback) => {
    ipcRenderer.on('bot:log', (_, data) => callback(data));
  },
});
