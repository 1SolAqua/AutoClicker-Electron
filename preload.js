// preload.js — Secure bridge: exposes safe APIs to the renderer via contextBridge
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // ── Clicker controls ──────────────────────────────────────────────
  start:        ()          => ipcRenderer.invoke('clicker:start'),
  stop:         ()          => ipcRenderer.invoke('clicker:stop'),
  setMode:      (mode)      => ipcRenderer.invoke('clicker:setMode', mode),
  setInterval:  (ms)        => ipcRenderer.invoke('clicker:setInterval', ms),
  setLimit:     (n)         => ipcRenderer.invoke('clicker:setLimit', n),
  setKey:       (vk, name)  => ipcRenderer.invoke('clicker:setKey', vk, name),
  setScrollDir: (dir)       => ipcRenderer.invoke('clicker:setScrollDir', dir),

  // ── Targeting ─────────────────────────────────────────────────────
  pickXY:             ()    => ipcRenderer.invoke('target:pickXY'),
  clearTarget:        ()    => ipcRenderer.invoke('target:clear'),
  addMultiTarget:     ()    => ipcRenderer.invoke('target:addMulti'),
  removeMultiTarget:  (i)   => ipcRenderer.invoke('target:removeMulti', i),
  clearMultiTargets:  ()    => ipcRenderer.invoke('target:clearMulti'),

  // ── Macro Recorder ────────────────────────────────────────────────
  startRecording: ()        => ipcRenderer.invoke('macro:startRecording'),
  stopRecording:  ()        => ipcRenderer.invoke('macro:stopRecording'),
  playMacro:      (evts)    => ipcRenderer.invoke('macro:play', evts),
  stopMacro:      ()        => ipcRenderer.invoke('macro:stop'),

  // ── Hotkey ────────────────────────────────────────────────────────
  setHotkey:    (key)       => ipcRenderer.invoke('hotkey:set', key),
  getHotkey:    ()          => ipcRenderer.invoke('hotkey:get'),

  // ── License ───────────────────────────────────────────────────────
  checkLicense: (key)       => ipcRenderer.invoke('license:check', key),
  sendCode:     (email)     => ipcRenderer.invoke('license:sendCode', email),
  verifyCode:   (email, c)  => ipcRenderer.invoke('license:verifyCode', email, c),
  getLicense:   ()          => ipcRenderer.invoke('license:get'),
  saveLicense:  (data)      => ipcRenderer.invoke('license:save', data),
  clearLicense: ()          => ipcRenderer.invoke('license:clear'),

  // ── Settings / Presets ────────────────────────────────────────────
  getSettings:  ()          => ipcRenderer.invoke('store:getSettings'),
  savePreset:   (preset)    => ipcRenderer.invoke('store:savePreset', preset),
  deletePreset: (id)        => ipcRenderer.invoke('store:deletePreset', id),
  getPresets:   ()          => ipcRenderer.invoke('store:getPresets'),

  // ── Window controls ───────────────────────────────────────────────
  minimize:     ()          => ipcRenderer.send('window:minimize'),
  maximize:     ()          => ipcRenderer.send('window:maximize'),
  close:        ()          => ipcRenderer.send('window:close'),

  // ── Events from main → renderer ───────────────────────────────────
  onClickTick:      (cb) => ipcRenderer.on('clicker:tick',       (_, d) => cb(d)),
  onTargetPicked:   (cb) => ipcRenderer.on('target:picked',      (_, d) => cb(d)),
  onStatusChange:   (cb) => ipcRenderer.on('status:change',      (_, d) => cb(d)),
  onMacroEvent:     (cb) => ipcRenderer.on('macro:event',        (_, d) => cb(d)),
  onMacroPlayState: (cb) => ipcRenderer.on('macro:playState',    (_, d) => cb(d)),

  // ── Utils ─────────────────────────────────────────────────────────
  openURL:      (url)       => ipcRenderer.invoke('shell:openURL', url),
  platform:     ()          => process.platform,
});
