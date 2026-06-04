// HTTPS server + WebSocket hub for VR Phobia Exposure (IKAN)
// - Serves /researcher and /participant UIs
// - Hosts a WebSocket hub on path /ws
// - If a recorder is reachable at ws://127.0.0.1:8765 it bridges to it (production AURA)
// - Otherwise it acts as a standalone broadcast hub (useful with mock recorder also at 8765)

const fs = require('fs');
const path = require('path');
const https = require('https');
const express = require('express');
const WebSocket = require('ws');

const PORT = parseInt(process.env.PORT || '8443', 10);
const RECORDER_URL = process.env.RECORDER_URL || 'ws://127.0.0.1:8765';
const ROOT = path.resolve(__dirname, '..');
const CERT_DIR = path.join(ROOT, 'server', 'cert');

function loadCert() {
  const keyPath = path.join(CERT_DIR, 'key.pem');
  const certPath = path.join(CERT_DIR, 'cert.pem');
  if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
    console.error('[server] TLS cert not found. Run: npm run cert');
    process.exit(1);
  }
  return { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) };
}

const app = express();
app.use(express.json());

// Static
app.use('/videos', express.static(path.join(ROOT, 'videos'), { acceptRanges: true }));
app.use('/data', express.static(path.join(ROOT, 'data')));
app.use(express.static(path.join(ROOT, 'public')));

// Content API
app.get('/api/content', (_req, res) => {
  res.sendFile(path.join(ROOT, 'data', 'content.json'));
});

// Friendly routes
app.get('/researcher', (_req, res) => res.sendFile(path.join(ROOT, 'public', 'researcher.html')));
app.get('/participant', (_req, res) => res.sendFile(path.join(ROOT, 'public', 'participant.html')));
app.get('/wait', (_req, res) => res.sendFile(path.join(ROOT, 'public', 'wait.html')));
app.get('/', (_req, res) => res.sendFile(path.join(ROOT, 'public', 'index.html')));

const server = https.createServer(loadCert(), app);

// --- WebSocket hub at /ws ---
const wss = new WebSocket.Server({ server, path: '/ws' });

// Session state snapshot so re-connecting clients can rejoin mid-session
let sessionState = {
  active: false,
  startPayload: null,        // last start_experiment payload
  current_level: null,
  auto_adaptation: true,
  last_adaptive_state: null,
};

let recorderSocket = null;
let recorderReady = false;
let recorderRetryTimer = null;

function broadcast(obj, except) {
  const msg = JSON.stringify(obj);
  wss.clients.forEach((c) => {
    if (c !== except && c.readyState === WebSocket.OPEN) {
      try { c.send(msg); } catch (_) {}
    }
  });
}

function sendTo(ws, obj) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

function connectRecorder() {
  try {
    recorderSocket = new WebSocket(RECORDER_URL);
  } catch (e) {
    scheduleRecorderRetry();
    return;
  }
  recorderSocket.on('open', () => {
    recorderReady = true;
    console.log('[server] recorder connected at', RECORDER_URL);
    broadcast({ type: 'recorder_ready', source: 'bridge' });
  });
  recorderSocket.on('message', (data) => {
    // Forward everything from recorder to all browser clients
    let parsed;
    try { parsed = JSON.parse(data.toString()); } catch (_) { return; }
    if (parsed.type === 'adaptive_state') {
      sessionState.last_adaptive_state = parsed;
    }
    if (parsed.type === 'start_experiment') {
      sessionState.active = true;
      sessionState.startPayload = parsed;
      sessionState.current_level = parsed.level;
    }
    if (parsed.type === 'force_level') {
      sessionState.current_level = parsed.level;
    }
    if (parsed.type === 'stop_video') {
      sessionState.active = false;
    }
    broadcast(parsed);
  });
  recorderSocket.on('close', () => {
    recorderReady = false;
    console.log('[server] recorder disconnected — will retry');
    broadcast({ type: 'recorder_error', message: 'recorder offline' });
    scheduleRecorderRetry();
  });
  recorderSocket.on('error', (err) => {
    // suppress noisy logs on retry storms
    if (recorderReady) console.error('[server] recorder error:', err.message);
  });
}

function scheduleRecorderRetry() {
  if (recorderRetryTimer) return;
  recorderRetryTimer = setTimeout(() => {
    recorderRetryTimer = null;
    connectRecorder();
  }, 2000);
}

function sendToRecorder(obj) {
  if (recorderSocket && recorderSocket.readyState === WebSocket.OPEN) {
    recorderSocket.send(JSON.stringify(obj));
    return true;
  }
  return false;
}

wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress;
  console.log('[server] ws client connected:', ip);

  // Snapshot for late-joining clients
  if (recorderReady) sendTo(ws, { type: 'recorder_ready', source: 'bridge' });
  if (sessionState.active && sessionState.startPayload) {
    sendTo(ws, sessionState.startPayload);
    if (sessionState.current_level != null) {
      sendTo(ws, { type: 'force_level', level: sessionState.current_level });
    }
    if (sessionState.last_adaptive_state) {
      sendTo(ws, sessionState.last_adaptive_state);
    }
  }

  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch (_) { return; }

    // Forward to recorder when applicable (it computes adaptation + CSV)
    const forwardToRecorder = [
      'controller_start', 'manual_level', 'set_auto_adaptation', 'level_change', 'stop'
    ].includes(msg.type);

    if (forwardToRecorder && sendToRecorder(msg)) {
      // Recorder is authoritative — it will echo start_experiment/force_level/etc.
      // Still send a local ack to the controller for controller_start.
      if (msg.type === 'controller_start') sendTo(ws, { type: 'status', status: 'started' });
      return;
    }

    // Standalone fallback (no recorder): server broadcasts directly.
    switch (msg.type) {
      case 'controller_start': {
        const payload = {
          type: 'start_experiment',
          phobia_id: msg.phobia_id,
          phobia_name: msg.phobia_name,
          level: msg.level ?? 0,
          experiment_id: msg.experiment_id,
          duration_seconds: msg.duration_seconds ?? 0,
          session_type: msg.session_type || 'hybrid',
          baseline_calibration_seconds: msg.baseline_calibration_seconds ?? 0,
          ts: Date.now(),
        };
        sessionState.active = true;
        sessionState.startPayload = payload;
        sessionState.current_level = payload.level;
        broadcast(payload);
        sendTo(ws, { type: 'status', status: 'started' });
        break;
      }
      case 'manual_level': {
        sessionState.current_level = msg.level;
        broadcast({ type: 'force_level', level: msg.level, ts: Date.now() });
        break;
      }
      case 'set_auto_adaptation': {
        sessionState.auto_adaptation = !!msg.enabled;
        broadcast({ type: 'auto_adaptation_toggle', enabled: !!msg.enabled });
        break;
      }
      case 'stop':
      case 'stop_video': {
        sessionState.active = false;
        broadcast({ type: 'stop_video', ts: Date.now() });
        break;
      }
      case 'level_change': {
        sessionState.current_level = msg.level;
        // do not re-broadcast force_level (came from participant adaptation)
        break;
      }
    }
  });

  ws.on('close', () => {
    console.log('[server] ws client disconnected:', ip);
  });
});

connectRecorder();

server.listen(PORT, () => {
  console.log(`\n[server] HTTPS on https://0.0.0.0:${PORT}`);
  console.log('[server]  · Researcher:  /researcher');
  console.log('[server]  · Participant: /participant');
  console.log(`[server]  · WS hub path: wss://<host>:${PORT}/ws`);
  console.log(`[server]  · Recorder upstream: ${RECORDER_URL}\n`);
});
