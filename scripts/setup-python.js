// Windows-first setup: create .venv and install Python deps for AURA recorder + researcher panel.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const isWin = process.platform === 'win32';
const venv = path.join(ROOT, '.venv');
const venvPy = isWin
  ? path.join(venv, 'Scripts', 'python.exe')
  : path.join(venv, 'bin', 'python');

const MIN_PY = { major: 3, minor: 10 };
const MAX_PY = { major: 3, minor: 13 };

function run(cmd, args, opts = {}) {
  console.log('>', cmd, args.join(' '));
  const safeCmd = (isWin && /\s/.test(cmd) && !cmd.startsWith('"')) ? `"${cmd}"` : cmd;
  const r = spawnSync(safeCmd, args, { stdio: 'inherit', shell: isWin, ...opts });
  if (r.status !== 0) process.exit(r.status || 1);
}

function probePython(cmd, baseArgs = []) {
  const args = [...baseArgs, '-c', 'import sys; print(f"{sys.version_info[0]}.{sys.version_info[1]}")'];
  const safeCmd = (isWin && /\s/.test(cmd) && !cmd.startsWith('"')) ? `"${cmd}"` : cmd;
  const r = spawnSync(safeCmd, args, { encoding: 'utf8', shell: isWin });
  if (r.status !== 0) return null;
  const m = (r.stdout || '').trim().match(/^(\d+)\.(\d+)$/);
  if (!m) return null;
  return { major: +m[1], minor: +m[2] };
}

function versionOk(v) {
  if (v.major !== 3) return false;
  if (v.minor < MIN_PY.minor) return false;
  if (v.major > MAX_PY.major) return false;
  if (v.major === MAX_PY.major && v.minor > MAX_PY.minor) return false;
  return true;
}

function resolvePython() {
  if (!isWin) {
    const v = probePython('python3');
    if (v && versionOk(v)) return { cmd: 'python3', baseArgs: [] };
    failPython();
  }

  // Windows: prefer the py launcher (avoids Microsoft Store alias / wrong python on PATH).
  const candidates = [
    ['py', ['-3.12']],
    ['py', ['-3.11']],
    ['py', ['-3.10']],
    ['py', ['-3']],
    ['python', []],
  ];
  for (const [cmd, baseArgs] of candidates) {
    const v = probePython(cmd, baseArgs);
    if (v && versionOk(v)) {
      console.log(`[setup:python] Using ${cmd}${baseArgs.length ? ' ' + baseArgs.join(' ') : ''} (Python ${v.major}.${v.minor})`);
      return { cmd, baseArgs };
    }
  }
  failPython();
}

function failPython() {
  console.error('\n[setup:python] Python 3.10–3.13 not found.');
  if (isWin) {
    console.error('  1) Install Python 3.11 from https://www.python.org/downloads/windows/');
    console.error('  2) Check "Add python.exe to PATH" in the installer');
    console.error('  3) Disable the Microsoft Store alias: Settings > Apps > Advanced app settings > App execution aliases > python.exe OFF');
    console.error('  4) Re-run:  setup-env.bat');
  } else {
    console.error('  Install Python 3.10+ and re-run:  npm run setup:python');
  }
  process.exit(1);
}

const py = resolvePython();

if (!fs.existsSync(venvPy)) {
  run(py.cmd, [...py.baseArgs, '-m', 'venv', venv]);
}
run(venvPy, ['-m', 'pip', 'install', '--upgrade', 'pip']);
// QtWebSockets ships inside the base PyQt6 wheel (no separate PyPI package).
run(venvPy, ['-m', 'pip', 'install',
  'pylsl', 'numpy', 'scipy', 'websockets',
  'PyQt6',
]);
console.log('\n[setup:python] OK. venv at', venv);
