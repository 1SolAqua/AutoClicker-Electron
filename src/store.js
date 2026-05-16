// store.js — Persistent settings and presets using electron-store
const Store = require('electron-store');

const store = new Store({
  defaults: {
    license: null,          // { key, expiresAt, email }
    hotkey: 'F6',           // global hotkey string
    interval: 100,          // ms between clicks
    limit: 0,               // 0 = unlimited
    mode: 'left',           // left | right | scroll-up | scroll-down | key
    spamKey: 0x41,          // VK code for key spam (default A)
    spamKeyName: 'A',
    targetX: -1,
    targetY: -1,
    multiTargets: [],
    presets: [],
    windowBounds: { width: 900, height: 640 },
  }
});

module.exports = store;
