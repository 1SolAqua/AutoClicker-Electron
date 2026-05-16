// store.js — Persistent settings and presets using electron-store
//
// IMPORTANT: Do NOT change `name` between app versions.
// electron-store saves to %APPDATA%\AutoClicker\<name>.json (Windows)
// or ~/Library/Application Support/AutoClicker/<name>.json (Mac).
// Renaming would make the app forget all user settings on update.
const Store = require('electron-store');

const store = new Store({
  name: 'settings',  // fixed filename — never rename this
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
  },
  // Migrate old data if the store schema changes in a future version
  migrations: {
    // Example: '2.0.0': store => { store.set('newField', 'defaultValue'); }
  },
});

module.exports = store;
