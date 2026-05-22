const { EventEmitter } = require('events');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

class BotManager extends EventEmitter {
  constructor(userDataPath) {
    super();
    this.userDataPath = userDataPath;
    this.bots = new Map();
    this.configPath = path.join(userDataPath, 'config.json');
    this.backupDir = path.join(userDataPath, 'backups');
    if (!fs.existsSync(userDataPath)) fs.mkdirSync(userDataPath, { recursive: true });
    if (!fs.existsSync(this.backupDir)) fs.mkdirSync(this.backupDir, { recursive: true });
    this.loadConfig();

    if (this.config.bots) {
      for (const botConfig of this.config.bots) {
        this.bots.set(botConfig.id, {
          ...botConfig,
          process: null, status: 'stopped', logs: [],
          startTime: null, restartCount: 0,
          schedules: botConfig.schedules || [],
          nodeArgs: botConfig.nodeArgs || '',
        });
      }
    }

    setInterval(() => this.monitorBots(), 5000);
    setInterval(() => this.checkSchedules(), 10000);
  }

  get config() { return this._config || { bots: [] }; }
  set config(val) { this._config = val; }

  loadConfig() {
    try {
      if (fs.existsSync(this.configPath)) {
        this._config = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
      } else {
        this._config = { bots: [] };
        this.saveConfig();
      }
    } catch {
      this._config = { bots: [] };
      this.saveConfig();
    }
  }

  saveConfig() {
    try {
      const data = {
        bots: Array.from(this.bots.values()).map((b) => ({
          id: b.id, name: b.name, path: b.path, entry: b.entry || 'index.js',
          autoRestart: b.autoRestart !== false, env: b.env || {},
          nodeArgs: b.nodeArgs || '', schedules: b.schedules || [],
          network: b.network || { ports: [], webhooks: [] },
        })),
      };
      fs.writeFileSync(this.configPath, JSON.stringify(data, null, 2));
      this._config = data;
    } catch (err) {
      console.error('Failed to save config:', err);
    }
  }

  getNodePath() {
    return 'node';
  }

  addBot(botPath) {
    const id = 'bot_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const name = path.basename(botPath);
    const botEntry = this.findEntryFile(botPath);
    const bot = {
      id, name, path: botPath, entry: botEntry,
      autoRestart: true, env: {}, nodeArgs: '', schedules: [],
      network: { ports: [], webhooks: [] },
      process: null, status: 'stopped', logs: [],
      startTime: null, restartCount: 0,
    };
    this.bots.set(id, bot);
    this.saveConfig();
    this.emit('statusChange', { id, status: 'stopped', name });
    return { id, name, status: 'stopped' };
  }

  findEntryFile(botPath) {
    const candidates = ['index.js', 'bot.js', 'main.js', 'app.js', 'server.js'];
    for (const file of candidates) {
      if (fs.existsSync(path.join(botPath, file))) return file;
    }
    try {
      const files = fs.readdirSync(botPath).filter((f) => f.endsWith('.js'));
      return files.length > 0 ? files[0] : 'index.js';
    } catch { return 'index.js'; }
  }

  removeBot(id) {
    const bot = this.bots.get(id);
    if (!bot) return false;
    this.stop(id);
    this.bots.delete(id);
    this.saveConfig();
    return true;
  }

  list() {
    return Array.from(this.bots.values()).map((b) => ({
      id: b.id, name: b.name, status: b.status, path: b.path,
      entry: b.entry, autoRestart: b.autoRestart,
      startTime: b.startTime, restartCount: b.restartCount,
      uptime: b.startTime ? Date.now() - b.startTime : 0,
      nodeArgs: b.nodeArgs, schedules: b.schedules,
      network: b.network || { ports: [], webhooks: [] },
    }));
  }

  start(id) {
    const bot = this.bots.get(id);
    if (!bot) return { success: false, error: 'Bot not found' };
    if (bot.status === 'running') return { success: false, error: 'Already running' };

    const entryPath = path.join(bot.path, bot.entry);
    if (!fs.existsSync(entryPath)) {
      this.addLog(id, 'ERROR', `Entry file not found: ${entryPath}`);
      return { success: false, error: 'Entry file not found' };
    }

    try {
      const env = { ...process.env, ...bot.env };
      const nodeArgs = (bot.nodeArgs || '').split(' ').filter(Boolean);
      const nodeExe = this.getNodePath();

      bot.process = spawn(nodeExe, [...nodeArgs, entryPath], {
        cwd: bot.path, env,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: false,
      });

      bot.status = 'running';
      bot.startTime = Date.now();
      this.addLog(id, 'INFO', `Bot started (PID: ${bot.process.pid})`);

      bot.process.stdout.on('data', (data) => {
        this.addLog(id, 'STDOUT', data.toString().trimEnd());
      });
      bot.process.stderr.on('data', (data) => {
        this.addLog(id, 'STDERR', data.toString().trimEnd());
      });
      bot.process.on('exit', (code, signal) => {
        const info = `Exited with code ${code}${signal ? ` (signal: ${signal})` : ''}`;
        this.addLog(id, 'WARN', info);
        bot.process = null; bot.status = 'stopped'; bot.startTime = null;
        this.emit('statusChange', { id, status: 'stopped', name: bot.name });
        if (bot.autoRestart && code !== 0) {
          bot.restartCount++;
          this.addLog(id, 'INFO', `Auto-restarting (${bot.restartCount})...`);
          setTimeout(() => this.start(id), 2000);
        }
      });
      bot.process.on('error', (err) => {
        this.addLog(id, 'ERROR', `Process error: ${err.message}`);
        bot.process = null; bot.status = 'stopped';
        this.emit('statusChange', { id, status: 'stopped', name: bot.name });
      });

      this.emit('statusChange', { id, status: 'running', name: bot.name });
      return { success: true, status: 'running' };
    } catch (err) {
      this.addLog(id, 'ERROR', `Failed to start: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  stop(id) {
    const bot = this.bots.get(id);
    if (!bot) return { success: false, error: 'Bot not found' };
    if (bot.status !== 'running' || !bot.process) {
      bot.status = 'stopped';
      return { success: true, status: 'stopped' };
    }
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', bot.process.pid.toString(), '/f', '/t'], { windowsHide: true });
      } else {
        bot.process.kill('SIGTERM');
      }
      this.addLog(id, 'INFO', 'Stopping bot...');
      bot.status = 'stopping';
      this.emit('statusChange', { id, status: 'stopping', name: bot.name });
      setTimeout(() => {
        if (bot.process) {
          try { bot.process.kill('SIGKILL'); } catch {}
          bot.process = null; bot.status = 'stopped'; bot.startTime = null;
          this.emit('statusChange', { id, status: 'stopped', name: bot.name });
        }
      }, 5000);
      return { success: true, status: 'stopping' };
    } catch (err) {
      this.addLog(id, 'ERROR', `Failed to stop: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  restart(id) {
    const bot = this.bots.get(id);
    if (!bot) return { success: false, error: 'Bot not found' };
    this.stop(id);
    setTimeout(() => this.start(id), 1500);
    return { success: true, status: 'restarting' };
  }

  sendStdin(id, input) {
    const bot = this.bots.get(id);
    if (!bot || !bot.process || bot.status !== 'running') {
      return { success: false, error: 'Bot not running' };
    }
    try {
      bot.process.stdin.write(input + '\n');
      this.addLog(id, 'STDIN', input);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  update(id) {
    const bot = this.bots.get(id);
    if (!bot) return { success: false, error: 'Bot not found' };
    const wasRunning = bot.status === 'running';
    if (wasRunning) this.stop(id);

    return new Promise((resolve) => {
      const startGitPull = () => {
        try {
          const gitPath = path.join(bot.path, '.git');
          if (!fs.existsSync(gitPath)) {
            this.addLog(id, 'ERROR', 'Not a git repository');
            resolve({ success: false, error: 'Not a git repository' });
            return;
          }
          this.addLog(id, 'INFO', 'Pulling latest changes...');
          const git = spawn('git', ['pull'], { cwd: bot.path, shell: true, windowsHide: true });
          git.stdout.on('data', (d) => { this.addLog(id, 'GIT', d.toString().trim()); });
          git.stderr.on('data', (d) => { this.addLog(id, 'GIT', d.toString().trim()); });
          git.on('close', (code) => {
            if (code === 0) {
              this.addLog(id, 'INFO', 'Update completed');
              if (wasRunning) setTimeout(() => this.start(id), 1000);
              resolve({ success: true });
            } else {
              this.addLog(id, 'ERROR', `Git failed (code: ${code})`);
              resolve({ success: false, error: 'Git pull failed' });
            }
          });
          git.on('error', (err) => { resolve({ success: false, error: err.message }); });
        } catch (err) {
          resolve({ success: false, error: err.message });
        }
      };

      if (wasRunning) {
        setTimeout(startGitPull, 2000);
      } else {
        startGitPull();
      }
    });
  }

  runNpmInstall(id) {
    const bot = this.bots.get(id);
    if (!bot) return Promise.resolve({ success: false, error: 'Bot not found' });

    return new Promise((resolve) => {
      try {
        const pkgPath = path.join(bot.path, 'package.json');
        if (!fs.existsSync(pkgPath)) {
          resolve({ success: false, error: 'No package.json' });
          return;
        }
        this.addLog(id, 'INFO', 'Running npm install...');
        const npm = spawn('npm', ['install'], { cwd: bot.path, shell: true, windowsHide: true });
        npm.stdout.on('data', (d) => this.addLog(id, 'NPM', d.toString().trim()));
        npm.stderr.on('data', (d) => this.addLog(id, 'NPM', d.toString().trim()));
        npm.on('close', (code) => {
          if (code === 0) { this.addLog(id, 'INFO', 'npm install OK'); resolve({ success: true }); }
          else { this.addLog(id, 'ERROR', `npm install failed (${code})`); resolve({ success: false, error: 'npm install failed' }); }
        });
        npm.on('error', (err) => resolve({ success: false, error: err.message }));
      } catch (err) { resolve({ success: false, error: err.message }); }
    });
  }

  getSettings(id) {
    const bot = this.bots.get(id);
    if (!bot) return null;
    return {
      id: bot.id, name: bot.name, path: bot.path,
      entry: bot.entry, autoRestart: bot.autoRestart,
      env: bot.env, nodeArgs: bot.nodeArgs || '',
      schedules: bot.schedules || [],
      network: bot.network || { ports: [], webhooks: [] },
    };
  }

  saveSettings(id, settings) {
    const bot = this.bots.get(id);
    if (!bot) return { success: false };
    bot.autoRestart = settings.autoRestart;
    bot.entry = settings.entry;
    bot.env = settings.env || {};
    bot.nodeArgs = settings.nodeArgs || '';
    bot.schedules = settings.schedules || [];
    bot.network = settings.network || { ports: [], webhooks: [] };
    this.saveConfig();
    return { success: true };
  }

  getLogs(id) {
    const bot = this.bots.get(id);
    return bot ? bot.logs.slice(-500) : [];
  }

  addLog(id, level, message) {
    const bot = this.bots.get(id);
    if (!bot) return;
    const entry = { time: new Date().toISOString(), level, message };
    bot.logs.push(entry);
    if (bot.logs.length > 2000) bot.logs.splice(0, bot.logs.length - 2000);
    this.emit('log', { id, entry });
  }

  readDirectory(id, dirPath) {
    const bot = this.bots.get(id);
    if (!bot) return null;
    const fullPath = path.resolve(bot.path, dirPath || '');
    if (!fullPath.startsWith(path.resolve(bot.path))) return { error: 'Access denied' };
    try {
      const items = fs.readdirSync(fullPath, { withFileTypes: true });
      return items.map((item) => {
        const itemPath = path.join(dirPath || '', item.name).replace(/\\/g, '/');
        const full = path.join(fullPath, item.name);
        let stat;
        try { stat = fs.statSync(full); } catch { stat = null; }
        return { name: item.name, path: itemPath, isDirectory: item.isDirectory(), size: stat ? stat.size : 0, modified: stat ? stat.mtimeMs : 0 };
      });
    } catch (err) { return { error: err.message }; }
  }

  readFile(id, filePath) {
    const bot = this.bots.get(id);
    if (!bot) return null;
    const fullPath = path.resolve(bot.path, filePath);
    if (!fullPath.startsWith(path.resolve(bot.path))) return { error: 'Access denied' };
    try {
      const ext = path.extname(filePath).toLowerCase();
      if (['.png','.jpg','.jpeg','.gif','.ico','.woff','.woff2','.eot','.ttf'].includes(ext)) {
        return { binary: true, name: path.basename(filePath) };
      }
      const content = fs.readFileSync(fullPath, 'utf-8');
      return { content, binary: false };
    } catch (err) { return { error: err.message }; }
  }

  writeFile(id, filePath, content) {
    const bot = this.bots.get(id);
    if (!bot) return { success: false, error: 'Bot not found' };
    const fullPath = path.resolve(bot.path, filePath);
    if (!fullPath.startsWith(path.resolve(bot.path))) return { success: false, error: 'Access denied' };
    try { fs.writeFileSync(fullPath, content, 'utf-8'); this.addLog(id, 'INFO', `File saved: ${filePath}`); return { success: true }; }
    catch (err) { return { success: false, error: err.message }; }
  }

  createFile(id, filePath) {
    const bot = this.bots.get(id);
    if (!bot) return { success: false, error: 'Bot not found' };
    const fullPath = path.resolve(bot.path, filePath);
    if (!fullPath.startsWith(path.resolve(bot.path))) return { success: false, error: 'Access denied' };
    try { if (fs.existsSync(fullPath)) return { success: false, error: 'File exists' }; fs.writeFileSync(fullPath, '', 'utf-8'); return { success: true }; }
    catch (err) { return { success: false, error: err.message }; }
  }

  createDirectory(id, dirPath) {
    const bot = this.bots.get(id);
    if (!bot) return { success: false, error: 'Bot not found' };
    const fullPath = path.resolve(bot.path, dirPath);
    if (!fullPath.startsWith(path.resolve(bot.path))) return { success: false, error: 'Access denied' };
    try { fs.mkdirSync(fullPath, { recursive: true }); return { success: true }; }
    catch (err) { return { success: false, error: err.message }; }
  }

  deleteItem(id, itemPath) {
    const bot = this.bots.get(id);
    if (!bot) return { success: false, error: 'Bot not found' };
    const fullPath = path.resolve(bot.path, itemPath);
    if (!fullPath.startsWith(path.resolve(bot.path))) return { success: false, error: 'Access denied' };
    try {
      if (fs.statSync(fullPath).isDirectory()) fs.rmSync(fullPath, { recursive: true, force: true });
      else fs.unlinkSync(fullPath);
      return { success: true };
    } catch (err) { return { success: false, error: err.message }; }
  }

  renameItem(id, oldPath, newPath) {
    const bot = this.bots.get(id);
    if (!bot) return { success: false, error: 'Bot not found' };
    const f1 = path.resolve(bot.path, oldPath), f2 = path.resolve(bot.path, newPath);
    if (!f1.startsWith(path.resolve(bot.path)) || !f2.startsWith(path.resolve(bot.path))) return { success: false, error: 'Access denied' };
    try { fs.renameSync(f1, f2); return { success: true }; }
    catch (err) { return { success: false, error: err.message }; }
  }

  createBackup(id) {
    const bot = this.bots.get(id);
    if (!bot) return { success: false, error: 'Bot not found' };
    const botBackupDir = path.join(this.backupDir, id);
    if (!fs.existsSync(botBackupDir)) fs.mkdirSync(botBackupDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupName = `${bot.name}-${timestamp}.zip`;
    const backupPath = path.join(botBackupDir, backupName);

    return new Promise((resolve) => {
      this.addLog(id, 'INFO', `Creating backup: ${backupName}`);
      try {
        const zip = spawn('powershell', [
          '-NoProfile', '-Command',
          `Compress-Archive -Path '${bot.path}\\*' -DestinationPath '${backupPath}' -Force`
        ], { shell: true, windowsHide: true });

        zip.on('close', (code) => {
          if (code === 0 && fs.existsSync(backupPath)) {
            this.addLog(id, 'INFO', `Backup created: ${backupName}`);
            resolve({ success: true, backupPath, backupName });
          } else {
            this.addLog(id, 'ERROR', 'Backup failed - trying fallback...');
            this.fallbackBackup(bot.path, backupPath, id, backupName, resolve);
          }
        });
        zip.on('error', () => this.fallbackBackup(bot.path, backupPath, id, backupName, resolve));
      } catch {
        this.fallbackBackup(bot.path, backupPath, id, backupName, resolve);
      }
    });
  }

  fallbackBackup(sourcePath, destPath, id, name, resolve) {
    try {
      this.addLog(id, 'INFO', 'Using file-copy backup method...');
      const tmpDir = destPath.replace('.zip', '');
      if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
      fs.mkdirSync(tmpDir, { recursive: true });
      this.copyDirSync(sourcePath, tmpDir);
      const AdmZip = (() => { try { return require('adm-zip'); } catch { return null; } })();
      if (AdmZip) {
        const zip = new AdmZip();
        zip.addLocalFolder(tmpDir);
        zip.writeZip(destPath);
        fs.rmSync(tmpDir, { recursive: true, force: true });
        if (fs.existsSync(destPath)) {
          this.addLog(id, 'INFO', `Backup created (fallback): ${name}`);
          resolve({ success: true, backupPath: destPath, backupName: name });
          return;
        }
      }
      resolve({ success: false, error: 'Backup failed - install adm-zip for fallback' });
    } catch (err) {
      resolve({ success: false, error: `Backup failed: ${err.message}` });
    }
  }

  copyDirSync(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    for (const item of fs.readdirSync(src)) {
      const s = path.join(src, item), d = path.join(dest, item);
      if (fs.statSync(s).isDirectory()) this.copyDirSync(s, d);
      else fs.copyFileSync(s, d);
    }
  }

  listBackups(id) {
    const dir = path.join(this.backupDir, id);
    if (!fs.existsSync(dir)) return [];
    try {
      return fs.readdirSync(dir).filter((f) => f.endsWith('.zip')).map((f) => {
        const stat = fs.statSync(path.join(dir, f));
        return { name: f, size: stat.size, modified: stat.mtimeMs, path: path.join(dir, f) };
      }).sort((a, b) => b.modified - a.modified);
    } catch { return []; }
  }

  deleteBackup(id, name) {
    const p = path.join(this.backupDir, id, name);
    if (!p.startsWith(this.backupDir)) return { success: false, error: 'Access denied' };
    try { fs.unlinkSync(p); return { success: true }; } catch (err) { return { success: false, error: err.message }; }
  }

  checkSchedules() {
    for (const [id, bot] of this.bots) {
      if (!bot.schedules) continue;
      for (const sched of bot.schedules) {
        if (!sched.enabled) continue;
        const now = Date.now(), last = sched.lastRun || 0;
        if (sched.type === 'interval' && sched.interval && now - last >= sched.interval * 60000) {
          sched.lastRun = now; this.executeSchedule(id, sched);
        } else if (sched.type === 'cron' && sched.cron && now - last >= 60000) {
          try {
            const p = sched.cron.split(' '), d = new Date();
            if (p.length >= 5 && (p[0] === '*' || parseInt(p[0]) === d.getMinutes()) && (p[1] === '*' || parseInt(p[1]) === d.getHours())) {
              sched.lastRun = now; this.executeSchedule(id, sched);
            }
          } catch {}
        }
      }
    }
  }

  executeSchedule(id, sched) {
    this.addLog(id, 'INFO', `Schedule: ${sched.name}`);
    switch (sched.action) {
      case 'restart': this.restart(id); break;
      case 'update': this.update(id); break;
      case 'backup': this.createBackup(id); break;
      case 'command': if (sched.command) this.sendStdin(id, sched.command); break;
    }
  }

  getSystemStats() {
    const totalMem = os.totalmem(), freeMem = os.freemem();
    const cpus = os.cpus(), loadAvg = os.loadavg();
    const running = Array.from(this.bots.values()).filter((b) => b.status === 'running').length;
    return {
      memory: { total: totalMem, free: freeMem, used: totalMem - freeMem, usagePercent: ((totalMem - freeMem) / totalMem * 100).toFixed(1) },
      cpu: { cores: cpus.length, model: cpus[0]?.model || 'N/A', load: loadAvg[0] || 0 },
      os: { platform: os.platform(), release: os.release(), hostname: os.hostname(), uptime: os.uptime() },
      bots: { running, total: this.bots.size, stopped: this.bots.size - running },
    };
  }

  getBotSystemStats(id) {
    const bot = this.bots.get(id);
    if (!bot || !bot.process || bot.status !== 'running') return null;
    const pid = bot.process.pid;
    if (!pid) return null;

    return new Promise((resolve) => {
      try {
        const ps = spawn('powershell', [
          '-NoProfile', '-Command',
          `$p = Get-Process -Id ${pid} -ErrorAction SilentlyContinue; if ($p) { write-output "$($p.WorkingSet64)|$($p.TotalProcessorTime.TotalMilliseconds)" }`
        ], { stdio: ['ignore', 'pipe', 'pipe'], shell: false, windowsHide: true, timeout: 4000 });

        let output = '';
        ps.stdout.on('data', (d) => { output += d.toString(); });
        ps.on('close', (code) => {
          const line = output.trim();
          if (code !== 0 || !line) { resolve(null); return; }

          const parts = line.split('|');
          const memory = parseInt(parts[0]) || 0;
          const cpuMs = parseFloat(parts[1]) || 0;

          const now = Date.now();
          const lastCpuMs = bot._lastCpuMs || cpuMs;
          const lastTs = bot._lastCpuTs || now;
          const dt = (now - lastTs) / 1000;
          const dc = (cpuMs - lastCpuMs) / 1000;
          const cpuPercent = (dt > 0 && dc >= 0) ? Math.min((dc / dt) * 100, 100) : 0;

          bot._lastCpuMs = cpuMs;
          bot._lastCpuTs = now;

          resolve({ memory, cpu: Math.round(cpuPercent * 10) / 10 });
        });
        ps.on('error', () => resolve(null));
      } catch { resolve(null); }
    });
  }

  monitorBots() {
    for (const [, bot] of this.bots) {
      if (bot.status === 'running' && bot.process) {
        try { if (bot.process.killed) { bot.status = 'stopped'; bot.process = null; bot.startTime = null; } }
        catch { bot.status = 'stopped'; bot.process = null; bot.startTime = null; }
      }
    }
  }

  shutdown() {
    for (const [, bot] of this.bots) {
      if (bot.process) {
        try {
          if (process.platform === 'win32') spawn('taskkill', ['/pid', bot.process.pid.toString(), '/f', '/t'], { windowsHide: true });
          else bot.process.kill('SIGKILL');
        } catch {}
      }
    }
  }
}

module.exports = BotManager;
