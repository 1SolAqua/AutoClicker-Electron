// overlay-preload.js — minimal preload for the transparent pick overlay window
const { ipcRenderer } = require('electron');

window.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('click', (e) => {
    ipcRenderer.send('overlay:click', { x: e.screenX, y: e.screenY });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') ipcRenderer.send('overlay:escape');
  });
});
