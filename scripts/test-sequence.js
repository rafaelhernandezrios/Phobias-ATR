// Verify the recorder ramps levels 0->5 in auto_sequence mode.
const WebSocket = require('ws');
const URL = process.env.WS_URL || 'wss://127.0.0.1:8443/ws';
const opts = { rejectUnauthorized: false };

function open() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL, opts);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

(async () => {
  const part = await open();
  const res = await open();
  const levels = [];

  part.on('message', (d) => {
    const m = JSON.parse(d.toString());
    if (m.type === 'force_level') levels.push(m.level);
    if (m.type === 'start_experiment') levels.push(m.level);
  });

  res.send(JSON.stringify({
    type: 'controller_start',
    phobia_id: 'arachnophobia', phobia_name: 'Arachnophobia',
    level: 0, experiment_id: 'test_seq', duration_seconds: 12,
    session_type: 'auto_sequence', baseline_calibration_seconds: 0,
  }));

  await new Promise((r) => setTimeout(r, 14000));
  res.send(JSON.stringify({ type: 'stop' }));
  await new Promise((r) => setTimeout(r, 500));
  console.log('levels seen:', levels);
  const expected = [0, 1, 2, 3, 4, 5];
  const ok = expected.every((v) => levels.includes(v));
  if (!ok) { console.error('FAIL: missing some levels in ramp'); process.exit(1); }
  console.log('OK: auto_sequence ramped through all levels');
  process.exit(0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
