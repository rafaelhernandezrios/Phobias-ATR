// Orchestrator: spawns recorder (AURA python or mock node) + HTTPS server.
// Usage:  node scripts/run-experiment.js [--mock]
// Set OPEN_RESEARCHER=1 to open https://localhost:8443/researcher in the default browser.
const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const mock = process.argv.includes('--mock');

function spawnLogged(label, cmd, args, opts = {}) {
  // On Windows we use shell:true so things like `python` (without .exe) resolve via PATH,
  // but cmd.exe splits the command on spaces unless the executable path is quoted.
  const isWin = process.platform === 'win32';
  const safeCmd = (isWin && /\s/.test(cmd) && !cmd.startsWith('"')) ? `"${cmd}"` : cmd;
  const p = spawn(safeCmd, args, { cwd: ROOT, shell: isWin, ...opts });
  const tag = (line) => process.stdout.write(`[${label}] ${line}`);
  p.stdout.on('data', (d) => d.toString().split(/\r?\n/).filter(Boolean).forEach((l) => tag(l + '\n')));
  p.stderr.on('data', (d) => d.toString().split(/\r?\n/).filter(Boolean).forEach((l) => tag(l + '\n')));
  p.on('exit', (code) => console.log(`[${label}] exited with code ${code}`));
  return p;
}

let recorder;
if (mock) {
  recorder = spawnLogged('mock', process.execPath, [path.join('scripts', 'mock_recorder.js')]);
} else {
  // Prefer venv python on Windows; fall back to system python
  const venvPy = path.join(ROOT, '.venv', 'Scripts', 'python.exe');
  const py = fs.existsSync(venvPy) ? venvPy : (process.platform === 'win32' ? 'python' : 'python3');
  recorder = spawnLogged('aura', py, [path.join('scripts', 'aura_recorder.py')]);
}

function openResearcherPanel() {
  if (!process.env.OPEN_RESEARCHER) return;
  const url = 'https://localhost:8443/researcher';
  const openers = {
    win32: `start "" "${url}"`,
    darwin: `open "${url}"`,
    linux: `xdg-open "${url}"`,
  };
  const cmd = openers[process.platform];
  if (!cmd) return;
  setTimeout(() => {
    exec(cmd, { shell: true }, (err) => {
      if (err) console.log(`[https] open browser manually: ${url}`);
    });
  }, 1500);
}

// Give the recorder a head start
setTimeout(() => {
  const server = spawnLogged('https', process.execPath, [path.join('server', 'server.js')]);
  openResearcherPanel();
  const shutdown = () => {
    try { recorder.kill(); } catch (_) {}
    try { server.kill(); } catch (_) {}
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}, 800);
