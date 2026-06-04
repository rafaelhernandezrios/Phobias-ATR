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
  session_type: 'hybrid',
  duration_seconds: 0,
  sequence_timers: [],
};

function clearSequenceTimers() {
  for (const t of session.sequence_timers) clearTimeout(t);
  session.sequence_timers = [];
}

function scheduleAutoSequence(ws) {
  clearSequenceTimers();
  if (session.session_type !== 'auto_sequence') return;
  const startLevel = session.current_level ?? 0;
  const totalMs = (session.duration_seconds || 0) * 1000;
  if (totalMs <= 0) return;
  const remainingSteps = 5 - startLevel;
  if (remainingSteps <= 0) return;
  const stepMs = totalMs / (remainingSteps + 1);
  console.log(`[mock-recorder] auto_sequence: ${startLevel}->5 every ${(stepMs / 1000).toFixed(1)}s`);
  for (let i = 1; i <= remainingSteps; i++) {
    const target = startLevel + i;
    const handle = setTimeout(() => {
      if (!session.active) return;
      session.current_level = target;
      console.log(`[mock-recorder] auto_sequence -> level ${target}`);
      ws.send(JSON.stringify({ type: 'force_level', level: target, source: 'mock', auto: true }));
    }, stepMs * i);
    session.sequence_timers.push(handle);
  }
}

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

  // Sinusoidal fear curve so suggestions reliably cross the up/down thresholds.
  // Period 20s -> roughly one up + one down per 20s window.
  const phase = ((Date.now() - session.startedAt) / 20000) * 2 * Math.PI;
  const fear = 1.5 * Math.sin(phase) + 0.2 * randn();

  // Synthesize plausible metrics that move with the fear value
  const theta_fz = 1 + 0.4 * fear + 0.1 * randn();
  const beta_alpha = 1.0 + 0.3 * fear + 0.1 * randn();
  const alpha_post = 1.1 - 0.3 * fear + 0.1 * randn();
  const faa = 0.05 * fear + 0.05 * randn();

  let suggestion = 'hold';
  // In auto_sequence the level is driven by the schedule, not by EEG suggestions
  if (!inCal && session.session_type === 'hybrid' && session.current_level != null) {
    if (fear > 0.8 && session.current_level > 0) suggestion = 'down';
    else if (fear < -0.4 && session.current_level < 5) suggestion = 'up';
  }
  if (suggestion !== 'hold') {
    console.log(`[mock-recorder] suggestion=${suggestion}  fear=${fear.toFixed(2)}  level=${session.current_level}`);
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
    diagnostic: { buffer_samples: 0, records: 0 },
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
        clearSequenceTimers();
        session = {
          active: true,
          startedAt: Date.now(),
          baseline_calibration_seconds: m.baseline_calibration_seconds || 0,
          current_level: m.level ?? 0,
          auto_adaptation: true,
          session_type: m.session_type || 'hybrid',
          duration_seconds: m.duration_seconds || 0,
          sequence_timers: [],
        };
        scheduleAutoSequence(ws);
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
        // Echo so the researcher panel sees the auto-adapted level
        ws.send(JSON.stringify({ type: 'force_level', level: m.level, source: 'mock', auto: true }));
        break;
      case 'stop':
        clearSequenceTimers();
        session.active = false;
        ws.send(JSON.stringify({ type: 'stop_video', source: 'mock' }));
        break;
    }
  });
});
