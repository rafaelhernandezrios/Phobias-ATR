// Researcher panel logic
const $ = (id) => document.getElementById(id);
const log = (msg) => {
  const el = $('log');
  el.textContent = `[${new Date().toLocaleTimeString()}] ${msg}\n` + el.textContent;
  if (el.textContent.length > 8000) el.textContent = el.textContent.slice(0, 8000);
};

let ws = null;
let content = null;
let currentLevel = null;

function setConn(connected) {
  $('ws-dot').classList.toggle('on', connected);
  $('ws-dot').classList.toggle('off', !connected);
  $('ws-label').textContent = connected ? 'WS conectado' : 'WS desconectado';
}
function setRecorder(ready, msg) {
  $('rec-dot').classList.toggle('on', !!ready);
  $('rec-dot').classList.toggle('off', !ready);
  $('rec-label').textContent = ready ? 'recorder OK' : (msg || 'recorder offline');
}

async function loadContent() {
  const res = await fetch('/api/content');
  content = await res.json();
  const sel = $('phobia');
  sel.innerHTML = '';
  for (const p of content.phobias) {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = `${p.name_es || p.name}`;
    sel.appendChild(opt);
  }
}

function connectWS() {
  const url = `wss://${location.host}/ws`;
  ws = new WebSocket(url);
  ws.addEventListener('open', () => { setConn(true); log('WS abierto'); });
  ws.addEventListener('close', () => {
    setConn(false); setRecorder(false);
    log('WS cerrado — reintentando en 2s');
    setTimeout(connectWS, 2000);
  });
  ws.addEventListener('error', () => log('WS error'));
  ws.addEventListener('message', (ev) => {
    let m; try { m = JSON.parse(ev.data); } catch { return; }
    switch (m.type) {
      case 'recorder_ready': setRecorder(true); log('recorder listo'); break;
      case 'recorder_error': setRecorder(false, m.message); log('recorder error: ' + (m.message || '')); break;
      case 'status': log('status: ' + m.status); break;
      case 'start_experiment':
        currentLevel = m.level;
        $('current-level').textContent = String(m.level);
        log(`start_experiment ${m.phobia_id} L${m.level}`);
        break;
      case 'force_level':
        currentLevel = m.level;
        $('current-level').textContent = String(m.level);
        log(`force_level ${m.level}`);
        break;
      case 'stop_video':
        $('current-level').textContent = '—';
        log('stop_video');
        break;
      case 'adaptive_state': renderAdaptive(m); break;
    }
  });
}

function renderAdaptive(m) {
  const f = (v, d = 2) => (v == null || Number.isNaN(v)) ? '—' : Number(v).toFixed(d);
  $('m-phase').textContent = m.adaptive_phase || '—';
  $('m-fear').textContent = f(m.fear_index);
  $('m-sugg').textContent = m.level_suggestion || '—';
  const met = m.metrics || {};
  $('m-theta').textContent = f(met.theta_fz);
  $('m-ba').textContent = f(met.beta_alpha_fz_cz);
  $('m-ap').textContent = f(met.alpha_posterior);
  $('m-faa').textContent = f(met.faa);
  $('m-baseline').textContent = m.baseline_remaining_s != null ? `${f(m.baseline_remaining_s, 0)} s` : '—';
}

function send(obj) {
  if (!ws || ws.readyState !== 1) { log('WS no conectado'); return; }
  ws.send(JSON.stringify(obj));
}

function start() {
  const phId = $('phobia').value;
  const ph = content.phobias.find((p) => p.id === phId);
  send({
    type: 'controller_start',
    phobia_id: phId,
    phobia_name: ph ? ph.name : phId,
    level: parseInt($('level').value, 10),
    experiment_id: $('exp-id').value || `exp_${Date.now()}`,
    duration_seconds: parseInt($('duration').value, 10) || 0,
    session_type: $('session-type').value,
    baseline_calibration_seconds: parseInt($('baseline-cal').value, 10) || 0,
  });
}

function bind() {
  $('btn-start').addEventListener('click', start);
  $('btn-stop').addEventListener('click', () => send({ type: 'stop' }));
  $('adapt').addEventListener('change', (e) => send({ type: 'set_auto_adaptation', enabled: e.target.checked }));
  document.querySelectorAll('.levels button').forEach((b) => {
    b.addEventListener('click', () => send({ type: 'manual_level', level: parseInt(b.dataset.lvl, 10) }));
  });
}

(async () => {
  await loadContent();
  bind();
  connectWS();
})();
