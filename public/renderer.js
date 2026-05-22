let botsData = [];
let currentPage = 'dashboard';
let currentBotId = null;
let detailBotTab = 'console';
let scrollLocked = false;
let fileListPath = '';
let selectedLogBot = 'all';
let botStatsInterval = null;

function hideLoading() {
  const ls = document.getElementById('loading-screen');
  if (ls) { ls.classList.add('hidden'); setTimeout(() => { ls.style.display = 'none'; }, 500); }
}

document.addEventListener('DOMContentLoaded', () => {
  hideLoading();
  try { loadBots(); } catch(e) { console.error('loadBots failed:', e); }
  try { loadSystemStats(); } catch(e) { console.error('loadSystemStats failed:', e); }
  setInterval(() => { try { loadSystemStats(); } catch(e) {} }, 5000);
  setInterval(() => { try { updateBotStatuses(); } catch(e) {} }, 3000);

  if (typeof electronAPI !== 'undefined' && electronAPI) {
    electronAPI.onBotStatusChange((data) => {
      updateBotStatus(data.id, data.status);
      showToast(`${data.name}: ${data.status}`, 'info');
      try { loadBots(); } catch(e) {}
      if (data.id === currentBotId) updateDetailHeader();
    });
    electronAPI.onBotLog((data) => {
      if (selectedLogBot === data.id || selectedLogBot === 'all') appendGlobalLog(data.entry);
      if (data.id === currentBotId) appendConsoleLog(data.entry);
    });
  } else {
    console.error('electronAPI not available!');
  }
});

// ===== PAGE SWITCHING =====
function switchPage(page) {
  if (page !== 'bot-detail') stopBotStatsPolling();
  currentPage = page;
  document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
  const el = document.getElementById('page-' + page);
  if (el) el.classList.add('active');

  document.querySelectorAll('.nav-item').forEach((n) => n.classList.remove('active'));
  const nav = document.querySelector(`.nav-item[data-page="${page}"]`);
  if (nav) nav.classList.add('active');

  if (page === 'logs') refreshGlobalLogs();
}

// ===== BOT LIST =====
async function loadBots() {
  try { botsData = await electronAPI.bots.list(); } catch { botsData = []; }
  renderStats();
  renderBots();
  renderLogFilter();
}

function renderStats() {
  const total = botsData.length;
  const running = botsData.filter((b) => b.status === 'running').length;
  const stopped = botsData.filter((b) => b.status === 'stopped').length;
  setText('statTotalValue', total);
  setText('statRunningValue', running);
  setText('statStoppedValue', stopped);
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

async function loadSystemStats() {
  try {
    const s = await electronAPI.system.stats();
    if (!s) return;
    const memP = parseFloat(s.memory.usagePercent);
    setText('statMemoryValue', memP.toFixed(0) + '%');
    const memBar = document.getElementById('memBar');
    if (memBar) memBar.style.width = memP + '%';
    setText('memValue', memP.toFixed(0) + '%');
    const cpuL = Math.min(s.cpu.load * 10, 100);
    const cpuBar = document.getElementById('cpuBar');
    if (cpuBar) cpuBar.style.width = cpuL.toFixed(0) + '%';
    setText('cpuValue', cpuL.toFixed(0) + '%');
  } catch {}
}

function renderBots() {
  const c = document.getElementById('botsContainer');
  if (!c) return;
  if (botsData.length === 0) {
    c.innerHTML = `<div class="empty-state">
      <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
      <p>No bots configured yet</p>
      <button class="btn glass primary" onclick="addBot()">Add Your First Bot</button>
    </div>`;
    return;
  }
  c.innerHTML = botsData.map((bot) => `
    <div class="bot-card glass" id="bot-card-${bot.id}" onclick="openBotDetail('${bot.id}')">
      <div class="bot-card-header">
        <div class="bot-card-name">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="${bot.status === 'running' ? '#4ade80' : '#6b6890'}" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
          ${esc(bot.name)}
        </div>
        <div class="bot-status"><span class="bot-status-dot ${bot.status}"></span> ${bot.status}${bot.status === 'running' && bot.uptime ? fmtUptime(bot.uptime) : ''}</div>
      </div>
      <div class="bot-card-info">
        <span><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg> ${esc(bot.entry || 'N/A')}</span>
        <span><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> ${bot.uptime ? fmtUptime(bot.uptime) : '--'}</span>
        <span style="grid-column:1/-1"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> ${esc(bot.path || 'N/A')}</span>
      </div>
      <div class="bot-card-actions" onclick="event.stopPropagation()">
        <button class="btn btn-start" onclick="controlBot('${bot.id}','start')" ${bot.status==='running'?'disabled':''}><svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg> Start</button>
        <button class="btn btn-stop" onclick="controlBot('${bot.id}','stop')" ${bot.status!=='running'?'disabled':''}><svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg> Stop</button>
        <button class="btn btn-restart" onclick="controlBot('${bot.id}','restart')" ${bot.status==='stopped'?'disabled':''}><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 4v6h6M23 20v-6h-6"/><path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15"/></svg> Restart</button>
        <button class="btn btn-settings" onclick="openBotDetail('${bot.id}')"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg> Manage</button>
        <button class="btn btn-remove" onclick="removeBot('${bot.id}')" title="Remove bot">
          <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
        </button>
      </div>
    </div>
  `).join('');
}

async function updateBotStatuses() {
  let fresh;
  try { fresh = await electronAPI.bots.list(); } catch { return; }
  if (!fresh) return;
  botsData = fresh;
  renderStats();
  for (const bot of botsData) {
    const card = document.getElementById('bot-card-' + bot.id);
    if (!card) continue;
    const dot = card.querySelector('.bot-status-dot');
    const st = card.querySelector('.bot-status');
    if (dot) dot.className = 'bot-status-dot ' + bot.status;
    if (st) {
      st.innerHTML = `<span class="bot-status-dot ${bot.status}"></span> ${bot.status}${bot.status === 'running' && bot.uptime ? fmtUptime(bot.uptime) : ''}`;
    }
    const uptimeEl = card.querySelector('.bot-card-info span:nth-child(2)');
    if (uptimeEl) {
      uptimeEl.innerHTML = `<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> ${bot.uptime ? fmtUptime(bot.uptime) : '--'}`;
    }
  }
  if (currentBotId) updateDetailHeader();
}

function updateBotStatus(id, status) {
  const card = document.getElementById('bot-card-' + id);
  if (!card) return;
  const st = card.querySelector('.bot-status');
  if (st) {
    st.innerHTML = `<span class="bot-status-dot ${status}"></span> ${status}`;
  }
}

function controlBot(id, action) {
  const actions = { start: electronAPI.bots.start, stop: electronAPI.bots.stop, restart: electronAPI.bots.restart, update: electronAPI.bots.update };
  return actions[action](id).then((r) => {
    if (r?.success === false) showToast(r.error || 'Action failed', 'error');
    try { loadBots(); } catch(e) { console.error(e); }
    if (currentBotId) try { updateDetailHeader(); } catch(e) { console.error(e); }
  }).catch((e) => {
    showToast(e.message, 'error');
    try { loadBots(); } catch(e) {}
    if (currentBotId) try { updateDetailHeader(); } catch(e) {}
  });
}

async function addBot() {
  try { const r = await electronAPI.bots.add(); if (r) { showToast(`Bot "${r.name}" added`, 'success'); loadBots(); } }
  catch (e) { showToast(e.message, 'error'); }
}

async function removeBot(id) {
  if (!confirm('Remove this bot?')) return;
  try { await electronAPI.bots.remove(id); showToast('Bot removed', 'info'); loadBots(); } catch (e) { showToast(e.message, 'error'); }
}

function fmtUptime(ms) {
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  if (hr > 0) return ` (${hr}h ${min % 60}m)`;
  if (min > 0) return ` (${min}m ${sec % 60}s)`;
  return ` (${sec}s)`;
}

function esc(str) { const d = document.createElement('div'); d.textContent = str || ''; return d.innerHTML; }

// ===== BOT DETAIL PAGE (Pterodactyl/AMP Style) =====
async function openBotDetail(id) {
  currentBotId = id;
  switchPage('bot-detail');
  updateDetailHeader();
  switchBotTab('console');
  loadDetailConsole();
  loadDetailConfigs();
  startBotStatsPolling(id);
}

function closeBotDetail() {
  stopBotStatsPolling();
  currentBotId = null;
  switchPage('bots');
}

function startBotStatsPolling(id) {
  stopBotStatsPolling();
  const resEl = document.getElementById('botResources');
  if (resEl) resEl.style.display = 'flex';
  async function poll() {
    try {
      const stats = await electronAPI.system.botStats(id);
      if (!stats) {
        if (resEl) resEl.style.display = 'none';
        return;
      }
      if (resEl) resEl.style.display = 'flex';
      const cpuEl = document.getElementById('botCpuBar');
      const cpuVal = document.getElementById('botCpuValue');
      if (cpuEl) cpuEl.style.width = stats.cpu + '%';
      if (cpuVal) cpuVal.textContent = stats.cpu + '%';

      const memEl = document.getElementById('botMemBar');
      const memVal = document.getElementById('botMemValue');
      const memMb = (stats.memory / (1024 * 1024)).toFixed(0);
      const memPercent = Math.min((stats.memory / (512 * 1024 * 1024)) * 100, 100);
      if (memEl) memEl.style.width = memPercent + '%';
      if (memVal) memVal.textContent = memMb + ' MB';
    } catch {}
  }
  poll();
  botStatsInterval = setInterval(poll, 3000);
}

function stopBotStatsPolling() {
  if (botStatsInterval) {
    clearInterval(botStatsInterval);
    botStatsInterval = null;
  }
  const resEl = document.getElementById('botResources');
  if (resEl) resEl.style.display = 'none';
}

function updateDetailHeader() {
  const bot = botsData.find((b) => b.id === currentBotId);
  if (!bot) return;
  setText('detailBotName', bot.name);
  const statusEl = document.getElementById('detailBotStatus');
  if (statusEl) {
    statusEl.innerHTML = `<span class="bot-status-dot ${bot.status}"></span> ${bot.status} ${bot.status === 'running' && bot.uptime ? fmtUptime(bot.uptime) : ''}`;
  }
  const actionsEl = document.getElementById('detailActions');
  if (actionsEl) {
    actionsEl.innerHTML = `
      <button class="btn btn-start" onclick="detailControl('start')" ${bot.status === 'running' ? 'disabled' : ''}>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg> Start
      </button>
      <button class="btn btn-stop" onclick="detailControl('stop')" ${bot.status !== 'running' ? 'disabled' : ''}>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg> Stop
      </button>
      <button class="btn btn-restart" onclick="detailControl('restart')" ${bot.status === 'stopped' ? 'disabled' : ''}>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 4v6h6M23 20v-6h-6"/><path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15"/></svg> Restart
      </button>
      <button class="btn btn-update" onclick="detailControl('update')">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg> Update
      </button>
      <button class="btn btn-remove" onclick="removeBot('${bot.id}')" title="Remove this bot" style="margin-left:8px">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg> Remove
      </button>`;
  }
}

function detailControl(action) {
  controlBot(currentBotId, action);
}

// ===== BOT TABS =====
function switchBotTab(tab) {
  detailBotTab = tab;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
  document.querySelectorAll('.tab-content').forEach((t) => t.classList.toggle('active', t.id === 'tab-' + tab));

  if (tab === 'startup') loadStartupTab();
  if (tab === 'files') loadFileList('');
  if (tab === 'config') resetConfigEditor();
  if (tab === 'network') loadNetworkTab();
  if (tab === 'schedule') loadScheduleTab();
  if (tab === 'backup') loadBackupTab();
}

// ===== CONSOLE TAB =====
function loadDetailConsole() {
  const terminal = document.getElementById('detailConsole');
  if (!terminal) return;
  terminal.innerHTML = '<div class="terminal-placeholder">Loading console...</div>';
}

async function loadDetailConsole() {
  const terminal = document.getElementById('detailConsole');
  if (!terminal) return;
  try {
    const logs = await electronAPI.bots.logs(currentBotId);
    if (!logs || logs.length === 0) {
      terminal.innerHTML = '<div class="terminal-placeholder">Waiting for output...</div>';
      return;
    }
    terminal.innerHTML = logs.slice(-100).map((e) =>
      `<div class="log-entry"><span class="log-time">${fmtTime(e.time)}</span><span class="log-level ${e.level}">[${e.level}]</span><span class="log-msg">${esc(e.message)}</span></div>`
    ).join('');
    terminal.scrollTop = terminal.scrollHeight;
  } catch { terminal.innerHTML = '<div class="terminal-placeholder">Error loading console</div>'; }
}

function appendConsoleLog(entry) {
  const terminal = document.getElementById('detailConsole');
  if (!terminal) return;
  const ph = terminal.querySelector('.terminal-placeholder');
  if (ph) terminal.innerHTML = '';
  const div = document.createElement('div');
  div.className = 'log-entry';
  div.innerHTML = `<span class="log-time">${fmtTime(entry.time)}</span><span class="log-level ${entry.level}">[${entry.level}]</span><span class="log-msg">${esc(entry.message)}</span>`;
  terminal.appendChild(div);
  if (!scrollLocked) terminal.scrollTop = terminal.scrollHeight;
}

function clearDetailLogs() {
  const terminal = document.getElementById('detailConsole');
  if (terminal) terminal.innerHTML = '<div class="terminal-placeholder">Console cleared</div>';
}

function toggleScrollLock() {
  scrollLocked = !scrollLocked;
  const btn = document.getElementById('scrollLockBtn');
  if (btn) btn.textContent = scrollLocked ? 'Manual scroll' : 'Auto-scroll';
}

function sendConsoleCommand() {
  const input = document.getElementById('consoleInput');
  if (!input || !input.value.trim()) return;
  const cmd = input.value.trim();
  electronAPI.bots.stdin(currentBotId, cmd).then((r) => {
    if (r?.success === false) showToast(r.error, 'error');
  });
  input.value = '';
}

// ===== STARTUP TAB =====
async function loadStartupTab() {
  try {
    const s = await electronAPI.bots.settings(currentBotId);
    if (!s) return;
    document.getElementById('startup-entry').value = s.entry || '';
    document.getElementById('startup-args').value = s.nodeArgs || '';
    document.getElementById('startup-path').textContent = s.path || '-';
    const autorestart = document.getElementById('startup-autorestart');
    if (autorestart) autorestart.checked = s.autoRestart !== false;

    const container = document.getElementById('startup-env-container');
    container.innerHTML = Object.entries(s.env || {}).map(([k, v]) =>
      `<div class="env-row"><input class="env-key" placeholder="Key" value="${esc(k)}"><input class="env-val" type="password" placeholder="Value" value="${esc(v)}"><button class="btn glass" onclick="this.parentElement.remove()" style="padding:4px 8px;font-size:14px">×</button></div>`
    ).join('');
  } catch {}
}

function addStartupEnvVar() {
  const c = document.getElementById('startup-env-container');
  if (!c) return;
  const d = document.createElement('div');
  d.className = 'env-row';
  d.innerHTML = '<input class="env-key" placeholder="Key"><input class="env-val" type="password" placeholder="Value"><button class="btn glass" onclick="this.parentElement.remove()" style="padding:4px 8px;font-size:14px">×</button>';
  c.appendChild(d);
}

async function saveStartupConfig() {
  const env = {};
  document.querySelectorAll('#startup-env-container .env-row').forEach((row) => {
    const k = row.querySelector('.env-key')?.value?.trim();
    const v = row.querySelector('.env-val')?.value;
    if (k) env[k] = v || '';
  });

  try {
    await electronAPI.bots.saveSettings(currentBotId, {
      entry: document.getElementById('startup-entry').value,
      nodeArgs: document.getElementById('startup-args').value,
      autoRestart: document.getElementById('startup-autorestart').checked,
      env,
    });
    showToast('Startup config saved', 'success');
    loadBots();
  } catch (e) { showToast(e.message, 'error'); }
}

// ===== FILES TAB =====
async function loadFileList(dir) {
  fileListPath = dir || '';
  const listEl = document.getElementById('fileList');
  const breadcrumb = document.getElementById('fileBreadcrumb');
  if (!listEl) return;

  listEl.innerHTML = '<div class="terminal-placeholder" style="padding:30px">Loading...</div>';

  try {
    const items = await electronAPI.files.list(currentBotId, dir || '');
    if (!items || items.error) {
      listEl.innerHTML = `<div class="terminal-placeholder">Error: ${items?.error || 'Cannot read directory'}</div>`;
      return;
    }

    // Breadcrumb
    const parts = (dir || '').split('/').filter(Boolean);
    let bcHtml = '<span onclick="loadFileList(\'\')" class="current">root</span>';
    let acc = '';
    for (const p of parts) {
      acc += '/' + p;
      bcHtml += `<span class="sep">/</span><span onclick="loadFileList('${acc}')">${esc(p)}</span>`;
    }
    breadcrumb.innerHTML = bcHtml;

    if (items.length === 0) {
      listEl.innerHTML = '<div class="terminal-placeholder" style="padding:30px">Empty directory</div>';
      return;
    }

    // Sort: folders first
    items.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    listEl.innerHTML = items.map((item) => {
      const icon = item.isDirectory ? '📁' : getFileIcon(item.name);
      const sizeStr = item.isDirectory ? '' : fmtSize(item.size);
      return `<div class="file-item" ondblclick="${item.isDirectory ? `loadFileList('${item.path}')` : `openFileEditor('${item.path}')`}">
        <span class="file-icon ${item.isDirectory ? 'folder' : getFileIconClass(item.name)}">${icon}</span>
        <span class="file-name">${esc(item.name)}</span>
        <span class="file-size">${sizeStr}</span>
        <span class="file-actions">
          ${!item.isDirectory ? `<button class="btn glass" onclick="event.stopPropagation();openFileEditor('${item.path}')" title="Edit">✏️</button>` : ''}
          <button class="btn glass" onclick="event.stopPropagation();renameItem('${item.path}',${item.isDirectory})" title="Rename">📝</button>
          <button class="btn btn-danger" onclick="event.stopPropagation();deleteItem('${item.path}')" title="Delete" style="padding:2px 6px;font-size:10px">🗑️</button>
        </span>
      </div>`;
    }).join('');
  } catch {
    listEl.innerHTML = '<div class="terminal-placeholder">Failed to load files</div>';
  }
}

function getFileIcon(name) {
  const ext = name.split('.').pop().toLowerCase();
  const icons = { js: '📜', json: '📋', env: '🔒', html: '🌐', css: '🎨', md: '📝', yml: '⚙️', yaml: '⚙️', gitignore: '👁️', txt: '📄', zip: '📦', png: '🖼️', jpg: '🖼️', jpeg: '🖼️', gif: '🖼️', svg: '🖼️', ico: '🖼️' };
  return icons[ext] || '📄';
}

function getFileIconClass(name) {
  const ext = name.split('.').pop().toLowerCase();
  if (['png','jpg','jpeg','gif','svg','ico','webp'].includes(ext)) return 'image';
  if (['js','ts','jsx','tsx','py','rb','go','rs'].includes(ext)) return 'code';
  if (['json','yaml','yml','toml','xml'].includes(ext)) return 'config';
  return 'file';
}

function fmtSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes/1024).toFixed(1) + ' KB';
  return (bytes/1048576).toFixed(1) + ' MB';
}

function refreshFileList() { loadFileList(fileListPath); }

async function openFileEditor(filePath) {
  try {
    const result = await electronAPI.files.read(currentBotId, filePath);
    if (!result || result.error) { showToast(result?.error || 'Cannot read file', 'error'); return; }
    if (result.binary) { showToast('Binary file cannot be edited', 'info'); return; }

    openModal('Edit: ' + filePath,
      `<textarea id="fileEditorContent" style="width:100%;min-height:400px;font-family:monospace;font-size:13px;background:rgba(0,0,0,0.3);border:1px solid var(--glass-border);border-radius:8px;padding:12px;color:var(--text-primary);resize:vertical;outline:none">${esc(result.content)}</textarea>
      <button class="btn primary" onclick="saveFileEditor('${filePath}')" style="margin-top:12px"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Save File</button>`
    );
  } catch (e) { showToast(e.message, 'error'); }
}

async function saveFileEditor(filePath) {
  const content = document.getElementById('fileEditorContent')?.value;
  if (!content) return;
  try {
    const r = await electronAPI.files.write(currentBotId, filePath, content);
    if (r.success) { showToast('File saved', 'success'); closeModal(); refreshFileList(); }
    else showToast(r.error, 'error');
  } catch (e) { showToast(e.message, 'error'); }
}

function createNewFile() {
  openModal('New File',
    `<label>File name (relative to bot directory)</label>
    <input type="text" id="newFileName" placeholder="e.g. src/commands/ping.js">
    <button class="btn primary" onclick="doCreateFile()">Create File</button>`
  );
}

async function doCreateFile() {
  const name = document.getElementById('newFileName')?.value?.trim();
  if (!name) return;
  try {
    const r = await electronAPI.files.create(currentBotId, name);
    if (r.success) { showToast('File created', 'success'); closeModal(); refreshFileList(); }
    else showToast(r.error, 'error');
  } catch (e) { showToast(e.message, 'error'); }
}

function createNewFolder() {
  openModal('New Folder',
    `<label>Folder name</label>
    <input type="text" id="newFolderName" placeholder="e.g. src/utils">
    <button class="btn primary" onclick="doCreateFolder()">Create Folder</button>`
  );
}

async function doCreateFolder() {
  const name = document.getElementById('newFolderName')?.value?.trim();
  if (!name) return;
  try {
    const r = await electronAPI.files.mkdir(currentBotId, name);
    if (r.success) { showToast('Folder created', 'success'); closeModal(); refreshFileList(); }
    else showToast(r.error, 'error');
  } catch (e) { showToast(e.message, 'error'); }
}

async function deleteItem(itemPath) {
  if (!confirm('Delete "' + itemPath + '"?')) return;
  try {
    const r = await electronAPI.files.delete(currentBotId, itemPath);
    if (r.success) { showToast('Deleted', 'info'); refreshFileList(); }
    else showToast(r.error, 'error');
  } catch (e) { showToast(e.message, 'error'); }
}

function renameItem(itemPath) {
  const name = itemPath.split('/').pop();
  openModal('Rename',
    `<label>Rename "${name}"</label>
    <input type="text" id="renameInput" value="${esc(name)}">
    <button class="btn primary" onclick="doRename('${itemPath}')">Rename</button>`
  );
}

async function doRename(oldPath) {
  const newName = document.getElementById('renameInput')?.value?.trim();
  if (!newName) return;
  const parts = oldPath.split('/');
  parts[parts.length - 1] = newName;
  const newPath = parts.join('/');
  try {
    const r = await electronAPI.files.rename(currentBotId, oldPath, newPath);
    if (r.success) { showToast('Renamed', 'success'); closeModal(); refreshFileList(); }
    else showToast(r.error, 'error');
  } catch (e) { showToast(e.message, 'error'); }
}

// ===== CONFIG TAB =====
let configEditorFilePath = null;

function resetConfigEditor() {
  configEditorFilePath = null;
  const filenameEl = document.getElementById('configEditorFilename');
  const saveBtn = document.getElementById('configSaveBtn');
  const editor = document.getElementById('configEditor');
  if (filenameEl) filenameEl.textContent = 'Select a file';
  if (saveBtn) saveBtn.style.display = 'none';
  if (editor) editor.value = '';
}

async function openConfigEditor(file) {
  configEditorFilePath = file;
  document.getElementById('configEditorFilename').textContent = 'Editing: ' + file;
  document.getElementById('configSaveBtn').style.display = 'flex';
  const editor = document.getElementById('configEditor');
  editor.value = 'Loading...';

  try {
    const r = await electronAPI.files.read(currentBotId, file);
    if (r?.error) { editor.value = '// Error: ' + r.error; return; }
    if (r?.binary) { editor.value = '// Binary file - cannot edit'; return; }
    editor.value = r?.content || '';
  } catch (e) { editor.value = '// Error: ' + e.message; }
}

async function saveConfigFile() {
  if (!configEditorFilePath) return;
  const content = document.getElementById('configEditor')?.value;
  if (!content) return;
  try {
    const r = await electronAPI.files.write(currentBotId, configEditorFilePath, content);
    if (r.success) { showToast(configEditorFilePath + ' saved', 'success'); }
    else showToast(r.error, 'error');
  } catch (e) { showToast(e.message, 'error'); }
}

async function npmInstall() {
  showToast('Running npm install...', 'info');
  try {
    const r = await electronAPI.bots.npmInstall(currentBotId);
    if (r.success) showToast('npm install completed', 'success');
    else showToast(r.error || 'npm install failed', 'error');
  } catch (e) { showToast(e.message, 'error'); }
}

// ===== NETWORK TAB =====
async function loadNetworkTab() {
  try {
    const s = await electronAPI.bots.settings(currentBotId);
    if (!s) return;
    const net = s.network || { ports: [], webhooks: [] };

    const pc = document.getElementById('network-ports-container');
    pc.innerHTML = (net.ports || []).map((p) =>
      `<div class="network-row"><input class="net-port-binding" placeholder="Port (e.g. 3000)" value="${esc(p.port||'')}"><input class="net-port-desc" placeholder="Description" value="${esc(p.description||'')}"><button class="btn glass btn-del" onclick="this.parentElement.remove()">×</button></div>`
    ).join('');

    const wc = document.getElementById('network-webhooks-container');
    wc.innerHTML = (net.webhooks || []).map((w) =>
      `<div class="network-row"><input class="net-webhook-url" placeholder="Webhook URL" value="${esc(w.url||'')}"><input class="net-webhook-desc" placeholder="Description" value="${esc(w.description||'')}"><button class="btn glass btn-del" onclick="this.parentElement.remove()">×</button></div>`
    ).join('');
  } catch {}
}

function addNetworkPort() {
  const c = document.getElementById('network-ports-container');
  const d = document.createElement('div'); d.className = 'network-row';
  d.innerHTML = '<input class="net-port-binding" placeholder="Port (e.g. 3000)"><input class="net-port-desc" placeholder="Description"><button class="btn glass btn-del" onclick="this.parentElement.remove()">×</button>';
  c.appendChild(d);
}

function addNetworkWebhook() {
  const c = document.getElementById('network-webhooks-container');
  const d = document.createElement('div'); d.className = 'network-row';
  d.innerHTML = '<input class="net-webhook-url" placeholder="Webhook URL"><input class="net-webhook-desc" placeholder="Description"><button class="btn glass btn-del" onclick="this.parentElement.remove()">×</button>';
  c.appendChild(d);
}

async function saveNetworkConfig() {
  const ports = [];
  document.querySelectorAll('#network-ports-container .network-row').forEach((r) => {
    const port = r.querySelector('.net-port-binding')?.value?.trim();
    const desc = r.querySelector('.net-port-desc')?.value?.trim();
    if (port) ports.push({ port, description: desc || '' });
  });
  const webhooks = [];
  document.querySelectorAll('#network-webhooks-container .network-row').forEach((r) => {
    const url = r.querySelector('.net-webhook-url')?.value?.trim();
    const desc = r.querySelector('.net-webhook-desc')?.value?.trim();
    if (url) webhooks.push({ url, description: desc || '' });
  });
  try {
    const s = await electronAPI.bots.settings(currentBotId);
    await electronAPI.bots.saveSettings(currentBotId, { ...s, network: { ports, webhooks } });
    showToast('Network config saved', 'success');
  } catch (e) { showToast(e.message, 'error'); }
}

// ===== SCHEDULE TAB =====
async function loadScheduleTab() {
  try {
    const s = await electronAPI.bots.settings(currentBotId);
    if (!s) return;
    const schedules = s.schedules || [];
    const c = document.getElementById('schedule-container');
    if (schedules.length === 0) {
      c.innerHTML = '<div class="terminal-placeholder" style="padding:20px">No scheduled tasks. Add one below.</div>';
      return;
    }
    c.innerHTML = schedules.map((sch, i) => `
      <div class="schedule-card glass">
        <div class="schedule-row">
          <input class="schedule-name" placeholder="Task name" value="${esc(sch.name||'')}" style="flex:1">
          <select class="schedule-type">
            <option value="interval" ${sch.type==='interval'?'selected':''}>Interval</option>
            <option value="cron" ${sch.type==='cron'?'selected':''}>Cron</option>
          </select>
          <input class="schedule-interval" placeholder="Minutes" value="${sch.type==='interval'?sch.interval||'':''}" style="width:80px" ${sch.type!=='interval'?'disabled':''}>
          <input class="schedule-cron" placeholder="* * * * *" value="${sch.type==='cron'?sch.cron||'':''}" style="flex:1" ${sch.type!=='cron'?'disabled':''}>
        </div>
        <div class="schedule-row" style="margin-top:8px">
          <select class="schedule-action">
            <option value="restart" ${sch.action==='restart'?'selected':''}>Restart</option>
            <option value="update" ${sch.action==='update'?'selected':''}>Git Update</option>
            <option value="backup" ${sch.action==='backup'?'selected':''}>Backup</option>
            <option value="command" ${sch.action==='command'?'selected':''}>Send Command</option>
          </select>
          <input class="schedule-command" placeholder="Command (for Send Command action)" value="${esc(sch.command||'')}" style="flex:2">
          <label class="toggle" style="margin:0 8px"><input type="checkbox" class="schedule-enabled" ${sch.enabled!==false?'checked':''}><span class="toggle-slider"></span></label>
          <button class="btn glass" onclick="this.closest('.schedule-card').remove()" style="padding:4px 8px">×</button>
        </div>
      </div>
    `).join('');

    // Toggle interval/cron inputs
    c.querySelectorAll('.schedule-type').forEach((sel) => {
      sel.onchange = function() {
        const card = this.closest('.schedule-card');
        card.querySelector('.schedule-interval').disabled = this.value !== 'interval';
        card.querySelector('.schedule-cron').disabled = this.value !== 'cron';
      };
    });
  } catch {}
}

function addSchedule() {
  const c = document.getElementById('schedule-container');
  const ph = c.querySelector('.terminal-placeholder');
  if (ph) c.innerHTML = '';
  const d = document.createElement('div'); d.className = 'schedule-card glass';
  d.innerHTML = `
    <div class="schedule-row">
      <input class="schedule-name" placeholder="Task name" style="flex:1">
      <select class="schedule-type"><option value="interval">Interval</option><option value="cron">Cron</option></select>
      <input class="schedule-interval" placeholder="Minutes" style="width:80px">
      <input class="schedule-cron" placeholder="* * * * *" style="flex:1" disabled>
    </div>
    <div class="schedule-row" style="margin-top:8px">
      <select class="schedule-action"><option value="restart">Restart</option><option value="update">Git Update</option><option value="backup">Backup</option><option value="command">Send Command</option></select>
      <input class="schedule-command" placeholder="Command (for Send Command)" style="flex:2">
      <label class="toggle" style="margin:0 8px"><input type="checkbox" class="schedule-enabled" checked><span class="toggle-slider"></span></label>
      <button class="btn glass" onclick="this.closest('.schedule-card').remove()" style="padding:4px 8px">×</button>
    </div>`;
  c.appendChild(d);
  d.querySelector('.schedule-type').onchange = function() {
    d.querySelector('.schedule-interval').disabled = this.value !== 'interval';
    d.querySelector('.schedule-cron').disabled = this.value !== 'cron';
  };
}

async function saveScheduleConfig() {
  const schedules = [];
  document.querySelectorAll('#schedule-container .schedule-card').forEach((card) => {
    const type = card.querySelector('.schedule-type')?.value || 'interval';
    schedules.push({
      name: card.querySelector('.schedule-name')?.value?.trim() || 'Task',
      type,
      interval: type === 'interval' ? parseInt(card.querySelector('.schedule-interval')?.value) || 60 : undefined,
      cron: type === 'cron' ? card.querySelector('.schedule-cron')?.value?.trim() || '0 * * * *' : undefined,
      action: card.querySelector('.schedule-action')?.value || 'restart',
      command: card.querySelector('.schedule-command')?.value?.trim() || '',
      enabled: card.querySelector('.schedule-enabled')?.checked !== false,
    });
  });
  try {
    const s = await electronAPI.bots.settings(currentBotId);
    await electronAPI.bots.saveSettings(currentBotId, { ...s, schedules });
    showToast('Schedules saved', 'success');
    loadBots();
  } catch (e) { showToast(e.message, 'error'); }
}

// ===== BACKUP TAB =====
async function loadBackupTab() {
  const c = document.getElementById('backup-list');
  if (!c) return;
  try {
    const backups = await electronAPI.backup.list(currentBotId);
    if (!backups || backups.length === 0) {
      c.innerHTML = '<div class="empty-state" style="padding:24px"><p>No backups yet</p></div>';
      return;
    }
    c.innerHTML = backups.map((b) => `
      <div class="backup-item glass">
        <div class="backup-info">
          <div class="backup-name">${esc(b.name)}</div>
          <div class="backup-meta">${fmtSize(b.size)} &middot; ${new Date(b.modified).toLocaleString()}</div>
        </div>
        <button class="btn btn-danger" onclick="deleteBackup('${esc(b.name)}')" style="font-size:11px;padding:4px 10px">Delete</button>
      </div>
    `).join('');
  } catch { c.innerHTML = '<div class="empty-state"><p>Error loading backups</p></div>'; }
}

async function createBackup() {
  showToast('Creating backup...', 'info');
  try {
    const r = await electronAPI.backup.create(currentBotId);
    if (r.success) { showToast('Backup created: ' + r.backupName, 'success'); loadBackupTab(); }
    else showToast(r.error, 'error');
  } catch (e) { showToast(e.message, 'error'); }
}

async function deleteBackup(name) {
  if (!confirm('Delete backup "' + name + '"?')) return;
  try {
    const r = await electronAPI.backup.delete(currentBotId, name);
    if (r.success) { showToast('Backup deleted', 'info'); loadBackupTab(); }
    else showToast(r.error, 'error');
  } catch (e) { showToast(e.message, 'error'); }
}

// ===== GLOBAL LOGS =====
function renderLogFilter() {
  const sel = document.getElementById('logBotFilter');
  if (!sel) return;
  const val = sel.value;
  sel.innerHTML = '<option value="all">All Bots</option>' + botsData.map((b) => `<option value="${b.id}">${esc(b.name)}</option>`).join('');
  sel.value = val;
}

function filterLogs() {
  selectedLogBot = document.getElementById('logBotFilter').value;
  refreshGlobalLogs();
}

async function refreshGlobalLogs() {
  const c = document.getElementById('logContainer');
  if (!c) return;
  c.innerHTML = '<div class="log-placeholder">Loading...</div>';
  try {
    let logs = [];
    if (selectedLogBot === 'all') {
      for (const bot of botsData) {
        const l = await electronAPI.bots.logs(bot.id);
        logs = logs.concat(l.map((e) => ({ ...e, botName: bot.name })));
      }
      logs.sort((a, b) => new Date(a.time) - new Date(b.time));
    } else {
      const l = await electronAPI.bots.logs(selectedLogBot);
      const bot = botsData.find((b) => b.id === selectedLogBot);
      logs = l.map((e) => ({ ...e, botName: bot ? bot.name : selectedLogBot }));
    }
    if (logs.length === 0) { c.innerHTML = '<div class="log-placeholder">No logs</div>'; return; }
    c.innerHTML = logs.slice(-200).map((e) =>
      `<div class="log-entry"><span class="log-time">${fmtTime(e.time)}</span><span class="log-level ${e.level}">[${e.level}]</span><span class="log-msg">${e.botName ? '['+esc(e.botName)+'] ' : ''}${esc(e.message)}</span></div>`
    ).join('');
    c.scrollTop = c.scrollHeight;
  } catch { c.innerHTML = '<div class="log-placeholder">Error loading logs</div>'; }
}

function appendGlobalLog(entry) {
  const c = document.getElementById('logContainer');
  if (!c) return;
  const ph = c.querySelector('.log-placeholder');
  if (ph) c.innerHTML = '';
  const div = document.createElement('div'); div.className = 'log-entry';
  div.innerHTML = `<span class="log-time">${fmtTime(entry.time)}</span><span class="log-level ${entry.level}">[${entry.level}]</span><span class="log-msg">${esc(entry.message)}</span>`;
  c.appendChild(div);
  c.scrollTop = c.scrollHeight;
}

function clearLogs() {
  const c = document.getElementById('logContainer');
  if (c) c.innerHTML = '<div class="log-placeholder">Logs cleared</div>';
}

function fmtTime(iso) {
  try { return new Date(iso).toLocaleTimeString('en-US', { hour12: false }); } catch { return iso; }
}

// ===== BOT LIST ACTIONS =====
async function startAll() {
  for (const bot of botsData) { if (bot.status === 'stopped') await electronAPI.bots.start(bot.id); }
  showToast('Starting all bots...', 'info'); loadBots();
}
async function stopAll() {
  if (document.getElementById('confirmActions')?.checked && !confirm('Stop all running bots?')) return;
  for (const bot of botsData) { if (bot.status === 'running' || bot.status === 'restarting') await electronAPI.bots.stop(bot.id); }
  showToast('Stopping all bots...', 'info'); loadBots();
}
async function restartAll() {
  for (const bot of botsData) { if (bot.status === 'running' || bot.status === 'restarting') await electronAPI.bots.restart(bot.id); }
  showToast('Restarting all bots...', 'info'); loadBots();
}

// ===== MODAL =====
function openModal(title, bodyHtml) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHtml;
  document.getElementById('modalOverlay').classList.add('open');
}

function closeModal(e) {
  if (e && e.target !== document.getElementById('modalOverlay')) return;
  document.getElementById('modalOverlay').classList.remove('open');
}

// ===== TOAST =====
function showToast(msg, type) {
  const c = document.getElementById('toastContainer');
  const t = document.createElement('div'); t.className = 'toast ' + type; t.textContent = msg;
  c.appendChild(t); setTimeout(() => t.remove(), 4000);
}
