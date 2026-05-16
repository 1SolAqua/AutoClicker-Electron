// main.js — Electron main process
const { app, BrowserWindow, ipcMain, globalShortcut, shell, screen } = require('electron');
const path    = require('path');
const store   = require('./src/store');
const clicker = require('./src/clicker');
const license = require('./src/license');

// ── State ─────────────────────────────────────────────────────────────────────
let mainWindow  = null;
let running     = false;
let clickTimer  = null;
let clicks      = 0;
let mode        = store.get('mode');
let intervalMs  = store.get('interval');
let limit       = store.get('limit');
let spamKey     = store.get('spamKey');
let targetX     = store.get('targetX');
let targetY     = store.get('targetY');
let multiTargets= store.get('multiTargets') || [];
let multiIdx    = 0;
let hotkey      = store.get('hotkey') || 'F6';
let pickOverlay = null;

// Macro recorder state
let macroEvents      = [];
let macroRecording   = false;
let macroRecTimer    = null;   // polls PS helper every 30 ms
let macroPlaying     = false;
let macroPlayTimeout = null;
let macroPlayIdx     = 0;

// ── Window ────────────────────────────────────────────────────────────────────
function createWindow() {
  const bounds = store.get('windowBounds');
  mainWindow = new BrowserWindow({
    width:           bounds.width  || 900,
    height:          bounds.height || 640,
    minWidth:        900,
    minHeight:       640,
    resizable:       true,
    frame:           false,
    backgroundColor: '#1a1b2e',
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.on('resize', () => {
    const [w, h] = mainWindow.getSize();
    store.set('windowBounds', { width: w, height: h });
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── Clicker engine ────────────────────────────────────────────────────────────
function doClick() {
  let x = targetX, y = targetY;

  if (mode === 'multi') {
    if (!multiTargets.length) return;
    const t = multiTargets[multiIdx % multiTargets.length];
    x = t.x; y = t.y;
    multiIdx++;
  }

  switch (mode) {
    case 'left':
    case 'multi':       clicker.leftClick(x, y);   break;
    case 'right':       clicker.rightClick(x, y);  break;
    case 'scroll-up':   clicker.scrollUp();         break;
    case 'scroll-down': clicker.scrollDown();       break;
    case 'key':         clicker.keyPress(spamKey);  break;
  }

  clicks++;
  if (mainWindow) mainWindow.webContents.send('clicker:tick', { clicks });
  if (limit > 0 && clicks >= limit) stopClicking();
}

function startClicking() {
  if (running) return;
  running = true; clicks = 0; multiIdx = 0;
  clickTimer = setInterval(doClick, intervalMs);
  if (mainWindow) mainWindow.webContents.send('status:change', { running: true });
}

function stopClicking() {
  if (!running) return;
  running = false;
  if (clickTimer) { clearInterval(clickTimer); clickTimer = null; }
  if (mainWindow) mainWindow.webContents.send('status:change', { running: false, clicks });
}

function toggleClicking() {
  if (running) stopClicking(); else startClicking();
}

// ── Global hotkey ─────────────────────────────────────────────────────────────
function registerHotkey(key) {
  globalShortcut.unregisterAll();
  try {
    const ok = globalShortcut.register(key, toggleClicking);
    if (!ok) console.warn('Hotkey registration failed:', key);
    else { hotkey = key; store.set('hotkey', key); }
  } catch (e) {
    console.warn('Invalid hotkey:', key, e.message);
  }
}

// ── Pick overlay (crosshair cursor for target selection) ──────────────────────
function openPickOverlay(forMulti = false) {
  if (pickOverlay) return;
  const { width, height } = screen.getPrimaryDisplay().bounds;

  pickOverlay = new BrowserWindow({
    x: 0, y: 0, width, height,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      preload:          path.join(__dirname, 'overlay-preload.js'),
      contextIsolation: false,
      nodeIntegration:  false,
    },
  });

  pickOverlay.setIgnoreMouseEvents(false);

  // Load a minimal HTML with crosshair cursor
  pickOverlay.loadURL('data:text/html,<!DOCTYPE html><html><head><style>*{margin:0;padding:0}body{width:100vw;height:100vh;cursor:crosshair;background:rgba(0,0,0,0.01)}</style></head><body></body></html>');

  // Handle click from overlay preload
  ipcMain.once('overlay:click', (event, { x, y }) => {
    closePickOverlay();
    if (forMulti) {
      multiTargets.push({ x, y });
      store.set('multiTargets', multiTargets);
      if (mainWindow) mainWindow.webContents.send('target:picked', { x, y, forMulti: true, targets: multiTargets });
    } else {
      targetX = x; targetY = y;
      store.set('targetX', x); store.set('targetY', y);
      if (mainWindow) mainWindow.webContents.send('target:picked', { x, y, forMulti: false });
    }
  });

  ipcMain.once('overlay:escape', () => closePickOverlay());

  pickOverlay.on('closed', () => {
    pickOverlay = null;
    ipcMain.removeAllListeners('overlay:click');
    ipcMain.removeAllListeners('overlay:escape');
  });
}

function closePickOverlay() {
  if (pickOverlay) { pickOverlay.close(); pickOverlay = null; }
}

// ── Macro Recorder ────────────────────────────────────────────────────────────
function startMacroRecording() {
  if (macroRecording) return;
  macroEvents = [];
  macroRecording = true;

  clicker.startRecording((ev) => {
    macroEvents.push(ev);
    if (mainWindow) mainWindow.webContents.send('macro:event', ev);
  });

  // Poll PS helper every 30ms for mouse state
  macroRecTimer = setInterval(() => {
    if (!macroRecording) { clearInterval(macroRecTimer); macroRecTimer = null; return; }
    clicker.pollRecord();
  }, 30);
}

function stopMacroRecording() {
  if (!macroRecording) return;
  macroRecording = false;
  if (macroRecTimer) { clearInterval(macroRecTimer); macroRecTimer = null; }
  clicker.stopRecording();
  if (mainWindow) mainWindow.webContents.send('macro:playState', { recording: false, playing: false, count: macroEvents.length });
}

function playMacro(events) {
  if (macroPlaying || !events || !events.length) return;
  macroEvents = events;
  macroPlaying = true;
  macroPlayIdx = 0;
  if (mainWindow) mainWindow.webContents.send('macro:playState', { playing: true });
  playNextMacroEvent();
}

function playNextMacroEvent() {
  if (!macroPlaying || macroPlayIdx >= macroEvents.length) {
    macroPlaying = false;
    if (mainWindow) mainWindow.webContents.send('macro:playState', { playing: false });
    return;
  }
  const ev = macroEvents[macroPlayIdx];
  const delay = Math.max(50, ev.d || 100);
  macroPlayTimeout = setTimeout(() => {
    if (!macroPlaying) return;
    if (ev.t === 'L') clicker.leftClick(ev.x, ev.y);
    else              clicker.rightClick(ev.x, ev.y);
    macroPlayIdx++;
    playNextMacroEvent();
  }, delay);
}

function stopMacro() {
  macroPlaying = false;
  if (macroPlayTimeout) { clearTimeout(macroPlayTimeout); macroPlayTimeout = null; }
  if (mainWindow) mainWindow.webContents.send('macro:playState', { playing: false });
}

// ── IPC Handlers ──────────────────────────────────────────────────────────────
ipcMain.handle('clicker:start',        () => startClicking());
ipcMain.handle('clicker:stop',         () => stopClicking());
ipcMain.handle('clicker:setMode',      (_, m)  => { mode = m; store.set('mode', m); });
ipcMain.handle('clicker:setInterval',  (_, ms) => {
  intervalMs = ms; store.set('interval', ms);
  if (running) { clearInterval(clickTimer); clickTimer = setInterval(doClick, ms); }
});
ipcMain.handle('clicker:setLimit',     (_, n)  => { limit = n; store.set('limit', n); });
ipcMain.handle('clicker:setKey',       (_, vk, name) => { spamKey = vk; store.set('spamKey', vk); store.set('spamKeyName', name); });
ipcMain.handle('clicker:setScrollDir', (_, dir) => { mode = dir === 'up' ? 'scroll-up' : 'scroll-down'; });

ipcMain.handle('target:clear', () => {
  targetX = -1; targetY = -1;
  store.set('targetX', -1); store.set('targetY', -1);
});
ipcMain.handle('target:addMulti', async () => {
  openPickOverlay(true);
  return multiTargets;
});
ipcMain.handle('target:removeMulti', (_, i) => {
  multiTargets.splice(i, 1);
  store.set('multiTargets', multiTargets);
  return multiTargets;
});
ipcMain.handle('target:clearMulti', () => {
  multiTargets = []; multiIdx = 0;
  store.set('multiTargets', []);
  return [];
});
ipcMain.handle('target:pickXY', async () => {
  openPickOverlay(false);
});

// Macro
ipcMain.handle('macro:startRecording', () => startMacroRecording());
ipcMain.handle('macro:stopRecording',  () => stopMacroRecording());
ipcMain.handle('macro:play',   (_, evts) => playMacro(evts));
ipcMain.handle('macro:stop',   ()        => stopMacro());

// Hotkey
ipcMain.handle('hotkey:set', (_, key) => { registerHotkey(key); return key; });
ipcMain.handle('hotkey:get', ()        => hotkey);

// License
ipcMain.handle('license:check',      (_, key)         => license.checkLicense(key));
ipcMain.handle('license:sendCode',   (_, email)       => license.sendCode(email));
ipcMain.handle('license:verifyCode', (_, email, code) => license.verifyCode(email, code));
ipcMain.handle('license:get',        ()               => store.get('license'));
ipcMain.handle('license:save',       (_, data)        => { store.set('license', data); });
ipcMain.handle('license:clear',      ()               => { store.set('license', null); });

// Settings / Presets
ipcMain.handle('store:getSettings', () => ({
  mode:        store.get('mode'),
  interval:    store.get('interval'),
  limit:       store.get('limit'),
  spamKey:     store.get('spamKey'),
  spamKeyName: store.get('spamKeyName'),
  targetX:     store.get('targetX'),
  targetY:     store.get('targetY'),
  multiTargets:store.get('multiTargets'),
  hotkey:      store.get('hotkey'),
  license:     store.get('license'),
}));

ipcMain.handle('store:savePreset', (_, preset) => {
  const presets = store.get('presets') || [];
  const idx = presets.findIndex(p => p.id === preset.id);
  if (idx >= 0) presets[idx] = preset; else presets.push(preset);
  store.set('presets', presets);
  return presets;
});
ipcMain.handle('store:deletePreset', (_, id) => {
  const presets = (store.get('presets') || []).filter(p => p.id !== id);
  store.set('presets', presets);
  return presets;
});
ipcMain.handle('store:getPresets', () => store.get('presets') || []);

// Shell
ipcMain.handle('shell:openURL', (_, url) => shell.openExternal(url));

// Window controls
ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:maximize', () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize());
ipcMain.on('window:close',    () => mainWindow?.close());

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow();
  registerHotkey(hotkey);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  stopClicking();
  stopMacroRecording();
  globalShortcut.unregisterAll();
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  stopClicking();
  stopMacroRecording();
  globalShortcut.unregisterAll();
});
