// Orchestrator: spawns recorder (AURA python or mock node) + HTTPS server.
// Usage:  node scripts/run-experiment.js [--mock]
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const mock = process.argv.includes('--mock');

function spawnLogged(label, cmd, args, opts = {}) {
  const p = spawn(cmd, args, { cwd: ROOT, shell: process.platform === 'win32', ...opts });
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

// Give the recorder a head start
setTimeout(() => {
  const server = spawnLogged('https', process.execPath, [path.join('server', 'server.js')]);
  const shutdown = () => {
    try { recorder.kill(); } catch (_) {}
    try { server.kill(); } catch (_) {}
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}, 800);
