// Mock recorder: WS server on 127.0.0.1:8765 that the HTTPS bridge connects to.
// Emits synthetic adaptive_state every 2s; echoes session control messages.
// Use only without the AURA headset (development / network checks).

const WebSocket = require('ws');

const PORT = parseInt(process.env.RECORDER_PORT || '8765', 10);
const HOST = '127.0.0.1';

const wss = new WebSocket.Server({ host: HOST, port: PORT }, () => {
  console.log(`[mock-recorder] ws://${HOST}:${PORT} ready`);
});

let session = {
  active: false,
  startedAt: 0,
  baseline_calibration_seconds: 0,
  current_level: null,
  auto_adaptation: true,
};

function broadcast(obj) {
  const msg = JSON.stringify(obj);
  wss.clients.forEach((c) => { if (c.readyState === WebSocket.OPEN) c.send(msg); });
}

function randn(mu = 0, sd = 1) {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return mu + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

setInterval(() => {
  if (!session.active) return;
  const t = (Date.now() - session.startedAt) / 1000;
  const inCal = t < session.baseline_calibration_seconds;

  const theta_fz = 1 + 0.4 * randn();
  const beta_alpha = 0.9 + 0.3 * randn();
  const alpha_post = 1.1 + 0.3 * randn();
  const faa = 0.05 * randn();
  const fear = 0.25 * (theta_fz + beta_alpha + (1.5 - alpha_post) + faa);

  let suggestion = 'hold';
  if (!inCal && session.current_level != null) {
    if (fear > 1.0 && session.current_level > 0) suggestion = 'down';
    else if (fear < -0.3 && session.current_level < 5) suggestion = 'up';
  }

  broadcast({
    type: 'adaptive_state',
    fear_index: fear,
    level_suggestion: suggestion,
    current_level: session.current_level,
    adaptive_phase: inCal ? 'calibration' : 'adaptation',
    baseline_remaining_s: inCal ? Math.max(0, session.baseline_calibration_seconds - t) : 0,
    metrics: {
      theta_fz, beta_alpha_fz_cz: beta_alpha, alpha_posterior: alpha_post, faa,
    },
    source: 'mock',
    ts: Date.now(),
  });
}, 2000);

wss.on('connection', (ws) => {
  console.log('[mock-recorder] bridge connected');
  ws.send(JSON.stringify({ type: 'recorder_ready', source: 'mock' }));

  ws.on('message', (data) => {
    let m; try { m = JSON.parse(data.toString()); } catch { return; }
    switch (m.type) {
      case 'controller_start':
        session = {
          active: true,
          startedAt: Date.now(),
          baseline_calibration_seconds: m.baseline_calibration_seconds || 0,
          current_level: m.level ?? 0,
          auto_adaptation: true,
        };
        // Echo start so the bridge re-broadcasts to clients
        ws.send(JSON.stringify({
          type: 'start_experiment',
          phobia_id: m.phobia_id,
          phobia_name: m.phobia_name,
          level: m.level ?? 0,
          experiment_id: m.experiment_id,
          duration_seconds: m.duration_seconds || 0,
          session_type: m.session_type || 'hybrid',
          baseline_calibration_seconds: m.baseline_calibration_seconds || 0,
          source: 'mock',
          ts: Date.now(),
        }));
        break;
      case 'manual_level':
        session.current_level = m.level;
        ws.send(JSON.stringify({ type: 'force_level', level: m.level, source: 'mock' }));
        break;
      case 'set_auto_adaptation':
        session.auto_adaptation = !!m.enabled;
        ws.send(JSON.stringify({ type: 'auto_adaptation_toggle', enabled: !!m.enabled }));
        break;
      case 'level_change':
        session.current_level = m.level;
        break;
      case 'stop':
        session.active = false;
        ws.send(JSON.stringify({ type: 'stop_video', source: 'mock' }));
        break;
    }
  });
});
