// Cross-platform: create .venv and install Python deps for the AURA recorder.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const isWin = process.platform === 'win32';
const py = isWin ? 'python' : 'python3';
const venv = path.join(ROOT, '.venv');
const venvPy = isWin
  ? path.join(venv, 'Scripts', 'python.exe')
  : path.join(venv, 'bin', 'python');

function run(cmd, args) {
  console.log('>', cmd, args.join(' '));
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: isWin });
  if (r.status !== 0) process.exit(r.status || 1);
}

if (!fs.existsSync(venvPy)) {
  run(py, ['-m', 'venv', venv]);
}
run(venvPy, ['-m', 'pip', 'install', '--upgrade', 'pip']);
run(venvPy, ['-m', 'pip', 'install', 'pylsl', 'numpy', 'scipy', 'websockets']);
console.log('\n[setup:python] OK. venv at', venv);
