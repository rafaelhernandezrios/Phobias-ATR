// Minimal smoke test: connect to wss://localhost:8443/ws as both researcher and participant,
// send controller_start, expect start_experiment broadcast on the other client.
const WebSocket = require('ws');

const URL = process.env.WS_URL || 'wss://127.0.0.1:8443/ws';
const opts = { rejectUnauthorized: false };

function open(label) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL, opts);
    ws.on('open', () => { console.log(`[${label}] open`); resolve(ws); });
    ws.on('error', reject);
  });
}

(async () => {
  const participant = await open('participant');
  const researcher = await open('researcher');

  const gotStart = new Promise((resolve) => {
    participant.on('message', (d) => {
      const m = JSON.parse(d.toString());
      console.log('[participant <-]', m.type, m.level ?? '');
      if (m.type === 'start_experiment') resolve(m);
    });
  });

  researcher.send(JSON.stringify({
    type: 'controller_start',
    phobia_id: 'arachnophobia', phobia_name: 'Arachnophobia',
    level: 1, experiment_id: 'test_ws', duration_seconds: 60,
    session_type: 'hybrid', baseline_calibration_seconds: 0,
  }));

  const start = await Promise.race([
    gotStart,
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout: no start_experiment')), 5000)),
  ]);
  console.log('OK: participant got start_experiment for', start.phobia_id, 'L' + start.level);

  researcher.send(JSON.stringify({ type: 'manual_level', level: 3 }));
  await new Promise((r) => setTimeout(r, 500));
  researcher.send(JSON.stringify({ type: 'stop' }));
  await new Promise((r) => setTimeout(r, 500));
  process.exit(0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
