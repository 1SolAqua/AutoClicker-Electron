// license.js — License validation against AutoClicker Vercel API
// Adds HMAC request signing so the server can verify requests come from the real app.

const https  = require('https');
const os     = require('os');
const crypto = require('crypto');

const API_BASE   = 'https://autoclicker-pi.vercel.app/api';
// Secret is injected at build time via scripts/inject-secrets.js — never hardcoded in source
const { APP_SECRET } = require('./secrets');

function getMachineId() {
  const raw = `${os.hostname()}|${os.userInfo().username}|${os.cpus()[0]?.model || 'cpu'}`;
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

function signRequest(body) {
  const ts  = Date.now().toString();
  const sig = crypto.createHmac('sha256', APP_SECRET)
    .update(`${ts}:${JSON.stringify(body)}`)
    .digest('hex');
  return { ts, sig };
}

function post(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const { ts, sig } = signRequest(body);
    const url  = new URL(API_BASE + path);
    const opts = {
      hostname: url.hostname,
      path:     url.pathname,
      method:   'POST',
      headers:  {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(data),
        'X-Timestamp':    ts,
        'X-Signature':    sig,
      },
    };
    const req = https.request(opts, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch { resolve({}); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function checkLicense(key) {
  try {
    // Detect platform so the server can enforce Win/Mac key separation
    const platform = process.platform === 'darwin' ? 'mac' : 'win';
    return await post('/check', { key, machineId: getMachineId(), platform });
  } catch {
    return null;
  }
}

async function sendCode(email) {
  try { return await post('/auth/change-password', { action: 'send', email }); }
  catch { return null; }
}

async function verifyCode(email, code, token) {
  try { return await post('/auth/change-password', { action: 'verify', email, code, token }); }
  catch { return null; }
}

async function resetPassword(email, code, token, newPassword) {
  try { return await post('/auth/change-password', { action: 'reset', email, code, token, newPassword }); }
  catch { return null; }
}

module.exports = { checkLicense, sendCode, verifyCode, resetPassword, getMachineId };
