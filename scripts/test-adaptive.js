// Verify the mock emits adaptive_state with up/down suggestions after calibration.
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
  const seen = { suggestions: {}, phases: {}, forced: 0 };

  part.on('message', (d) => {
    const m = JSON.parse(d.toString());
    if (m.type === 'adaptive_state') {
      seen.phases[m.adaptive_phase] = (seen.phases[m.adaptive_phase] || 0) + 1;
      seen.suggestions[m.level_suggestion] = (seen.suggestions[m.level_suggestion] || 0) + 1;
    }
    if (m.type === 'force_level') seen.forced++;
  });

  res.send(JSON.stringify({
    type: 'controller_start',
    phobia_id: 'arachnophobia', phobia_name: 'Arachnophobia',
    level: 2, experiment_id: 'test_adapt', duration_seconds: 60,
    session_type: 'hybrid', baseline_calibration_seconds: 4,
  }));

  // Wait ~30s and observe
  await new Promise((r) => setTimeout(r, 30000));
  res.send(JSON.stringify({ type: 'stop' }));
  await new Promise((r) => setTimeout(r, 500));
  console.log('seen:', JSON.stringify(seen, null, 2));
  const upDown = (seen.suggestions.up || 0) + (seen.suggestions.down || 0);
  if (upDown === 0) { console.error('FAIL: no up/down suggestions emitted'); process.exit(1); }
  console.log('OK: mock produced', upDown, 'up/down suggestions');
  process.exit(0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
