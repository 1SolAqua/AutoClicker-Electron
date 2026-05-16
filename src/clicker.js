// clicker.js — Cross-platform mouse/keyboard automation
// Windows: Persistent PowerShell process (Add-Type compiled once)
// Mac:     Persistent Python process (pyautogui)

const { spawn, execSync } = require('child_process');
const os   = require('os');
const path = require('path');
const fs   = require('fs');

const IS_WIN = os.platform() === 'win32';
const IS_MAC = os.platform() === 'darwin';

// ═══════════════════════════════════════════════════════════════════════════════
// WINDOWS — persistent PowerShell process
// ═══════════════════════════════════════════════════════════════════════════════
const PS_SCRIPT = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class AC {
    [DllImport("user32.dll")] public static extern void mouse_event(uint f,uint x,uint y,uint d,UIntPtr e);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
    [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
    [DllImport("user32.dll")] public static extern uint SendInput(uint n,INPUT[] p,int sz);
    [DllImport("user32.dll")] public static extern uint MapVirtualKey(uint c,uint t);
    [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X,Y; }
    [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT { public ushort wVk,wScan; public uint dwFlags,time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT { public int dx,dy; public uint mouseData,dwFlags,time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Explicit)] public struct INPUTUNION { [FieldOffset(0)] public KEYBDINPUT ki; [FieldOffset(0)] public MOUSEINPUT mi; }
    [StructLayout(LayoutKind.Sequential)] public struct INPUT { public uint type; public INPUTUNION u; }
    public static void LeftClick()  { mouse_event(0x0002,0,0,0,UIntPtr.Zero); mouse_event(0x0004,0,0,0,UIntPtr.Zero); }
    public static void RightClick() { mouse_event(0x0008,0,0,0,UIntPtr.Zero); mouse_event(0x0010,0,0,0,UIntPtr.Zero); }
    public static void ScrollUp()   { mouse_event(0x0800,0,0,120,UIntPtr.Zero); }
    public static void ScrollDown() { unchecked { mouse_event(0x0800,0,0,(uint)(-120),UIntPtr.Zero); } }
    public static POINT GetPos()    { POINT p; GetCursorPos(out p); return p; }
    [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vKey);
    public static bool IsLDown() { return (GetAsyncKeyState(0x01) & 0x8000) != 0; }
    public static bool IsRDown() { return (GetAsyncKeyState(0x02) & 0x8000) != 0; }
    public static void KeyPress(int vk) {
        ushort scan = (ushort)MapVirtualKey((uint)vk, 0);
        INPUT[] inp = new INPUT[2];
        inp[0].type=1; inp[0].u.ki.wScan=scan; inp[0].u.ki.dwFlags=0x0008u;
        inp[1].type=1; inp[1].u.ki.wScan=scan; inp[1].u.ki.dwFlags=0x000Au;
        SendInput(2, inp, System.Runtime.InteropServices.Marshal.SizeOf(typeof(INPUT)));
    }
}
"@
Write-Host "READY"
[Console]::Out.Flush()
while ($true) {
    try {
        $line = [Console]::ReadLine()
        if ($null -eq $line) { break }
        $parts = $line.Trim() -split ' '
        switch ($parts[0]) {
            'left'       { if ($parts.Count -ge 3) { [AC]::SetCursorPos([int]$parts[1],[int]$parts[2]) }; [AC]::LeftClick() }
            'right'      { if ($parts.Count -ge 3) { [AC]::SetCursorPos([int]$parts[1],[int]$parts[2]) }; [AC]::RightClick() }
            'scrollup'   { [AC]::ScrollUp() }
            'scrolldown' { [AC]::ScrollDown() }
            'key'        { [AC]::KeyPress([int]$parts[1]) }
            'getpos'     { $p=[AC]::GetPos(); Write-Host ("POS "+$p.X+" "+$p.Y); [Console]::Out.Flush() }
            'recstart'   { $g_recPrevL=$false;$g_recPrevR=$false;$g_recLastMs=[Environment]::TickCount; Write-Host "RECSTART"; [Console]::Out.Flush() }
            'recpoll'    {
                $lDown=[AC]::IsLDown(); $rDown=[AC]::IsRDown()
                $now=[Environment]::TickCount; $p=[AC]::GetPos()
                if($lDown -and !$g_recPrevL){ $d=[Math]::Max(50,$now-$g_recLastMs); $g_recLastMs=$now; Write-Host ("RECEVENT L "+$p.X+" "+$p.Y+" "+$d); [Console]::Out.Flush() }
                if($rDown -and !$g_recPrevR){ $d=[Math]::Max(50,$now-$g_recLastMs); $g_recLastMs=$now; Write-Host ("RECEVENT R "+$p.X+" "+$p.Y+" "+$d); [Console]::Out.Flush() }
                $g_recPrevL=$lDown; $g_recPrevR=$rDown
            }
            'quit'       { exit 0 }
        }
    } catch { }
}
`;

const PY_SCRIPT = `
import sys
try:
    import pyautogui
    pyautogui.FAILSAFE = False
    print('READY', flush=True)
    for line in sys.stdin:
        line = line.strip()
        if not line: continue
        parts = line.split()
        cmd = parts[0]
        try:
            if cmd == 'left':
                if len(parts) >= 3: pyautogui.click(int(parts[1]), int(parts[2]))
                else: pyautogui.click()
            elif cmd == 'right':
                if len(parts) >= 3: pyautogui.rightClick(int(parts[1]), int(parts[2]))
                else: pyautogui.rightClick()
            elif cmd == 'scrollup':   pyautogui.scroll(3)
            elif cmd == 'scrolldown': pyautogui.scroll(-3)
            elif cmd == 'key':        pyautogui.press(parts[1] if len(parts) > 1 else 'space')
            elif cmd == 'getpos':
                p = pyautogui.position()
                print(f'POS {p.x} {p.y}', flush=True)
            elif cmd == 'quit': break
        except: pass
except ImportError:
    print('ERROR: pyautogui not installed. Run: pip3 install pyautogui', flush=True)
`;

// ── Persistent process state ──────────────────────────────────────────────────
let helperProc     = null;
let helperReady    = false;
let cmdQueue       = [];
let posCallback    = null;
let posTimeout     = null;
let scriptPath     = null;
let macroEventCb   = null;   // called on each RECEVENT

function startHelper() {
  if (helperProc && !helperProc.killed) return;

  helperReady = false;

  if (IS_WIN) {
    // Write PS script to temp file
    if (!scriptPath) {
      scriptPath = path.join(os.tmpdir(), 'ac_win_helper.ps1');
      fs.writeFileSync(scriptPath, PS_SCRIPT, 'utf8');
    }
    helperProc = spawn('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
  } else if (IS_MAC) {
    helperProc = spawn('python3', ['-c', PY_SCRIPT], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } else {
    return;
  }

  let buf = '';
  helperProc.stdout.on('data', (data) => {
    buf += data.toString();
    const lines = buf.split('\n');
    buf = lines.pop(); // keep incomplete line
    for (const line of lines) {
      const l = line.trim();
      if (l === 'READY') {
        helperReady = true;
        // Flush queued commands
        while (cmdQueue.length) {
          try { helperProc.stdin.write(cmdQueue.shift() + '\n'); } catch {}
        }
      } else if (l.startsWith('POS ')) {
        const parts = l.split(' ');
        const pos = { x: parseInt(parts[1]) || 0, y: parseInt(parts[2]) || 0 };
        if (posCallback) {
          clearTimeout(posTimeout);
          posCallback(pos);
          posCallback = null;
        }
      } else if (l.startsWith('RECEVENT ')) {
        // RECEVENT L|R x y delay
        const parts = l.split(' ');
        if (macroEventCb) {
          macroEventCb({ t: parts[1], x: parseInt(parts[2]), y: parseInt(parts[3]), d: parseInt(parts[4]) });
        }
      } else if (l.startsWith('ERROR:')) {
        console.error('[clicker]', l);
      }
    }
  });

  helperProc.stderr.on('data', (d) => {
    // Suppress PS compilation warnings (common on first Add-Type run)
  });

  helperProc.on('close', (code) => {
    helperProc  = null;
    helperReady = false;
  });

  helperProc.on('error', (err) => {
    console.error('[clicker] Helper process error:', err.message);
    helperProc  = null;
    helperReady = false;
  });
}

function send(cmd) {
  if (!helperProc || helperProc.killed) {
    startHelper();
    cmdQueue.push(cmd);
    return;
  }
  if (!helperReady) {
    cmdQueue.push(cmd);
    return;
  }
  try { helperProc.stdin.write(cmd + '\n'); } catch (e) { /* proc died */ }
}

// ── Public API ────────────────────────────────────────────────────────────────

function leftClick(x, y) {
  send((x >= 0 && y >= 0) ? `left ${x} ${y}` : 'left');
}

function rightClick(x, y) {
  send((x >= 0 && y >= 0) ? `right ${x} ${y}` : 'right');
}

function scrollUp()   { send('scrollup');   }
function scrollDown() { send('scrolldown'); }

function keyPress(vk) {
  if (IS_WIN) {
    send(`key ${vk}`);
  } else if (IS_MAC) {
    // Map VK codes to pyautogui key names
    const VK_MAP = {
      0x08:'backspace',0x09:'tab',0x0D:'enter',0x1B:'escape',0x20:'space',
      0x25:'left',0x26:'up',0x27:'right',0x28:'down',
      0x2D:'insert',0x2E:'delete',
      0x70:'f1',0x71:'f2',0x72:'f3',0x73:'f4',0x74:'f5',0x75:'f6',
      0x76:'f7',0x77:'f8',0x78:'f9',0x79:'f10',0x7A:'f11',0x7B:'f12',
    };
    const key = VK_MAP[vk] || String.fromCharCode(vk).toLowerCase();
    send(`key ${key}`);
  }
}

// Returns a Promise<{x,y}> — use with await in ipcMain handlers
function getCursorPos() {
  return new Promise((resolve) => {
    posCallback = resolve;
    posTimeout  = setTimeout(() => {
      posCallback = null;
      resolve({ x: 0, y: 0 });
    }, 4000);
    send('getpos');
  });
}

function startRecording(onEvent) {
  macroEventCb = onEvent;
  send('recstart');
}

function stopRecording() {
  macroEventCb = null;
}

function pollRecord() {
  send('recpoll');
}

// ── Start helper early so it's warm by first click ───────────────────────────
if (IS_WIN || IS_MAC) startHelper();

// ── Cleanup on exit ───────────────────────────────────────────────────────────
process.on('exit', () => {
  if (helperProc && !helperProc.killed) {
    try { helperProc.stdin.write('quit\n'); } catch {}
    helperProc.kill();
  }
  if (scriptPath) try { fs.unlinkSync(scriptPath); } catch {}
});

module.exports = { leftClick, rightClick, scrollUp, scrollDown, keyPress, getCursorPos, startRecording, stopRecording, pollRecord };
