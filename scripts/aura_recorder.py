"""
AURA recorder — Lab Streaming Layer (LSL) inlet for the AURA EEG headset.

- Resolves an LSL stream named "AURA" (8 channels, ~250 Hz).
- Computes a Fear/Engagement z-score index (theta_Fz, beta/alpha, alpha posterior, FAA).
- Hosts a WebSocket server on 127.0.0.1:8765 that the HTTPS bridge connects to.
- On `stop`, writes a CSV in output/ with EEG samples + session labels.

Dependencies (Windows recommended):
    pip install pylsl numpy scipy websockets

Run:
    python scripts/aura_recorder.py
    # or, for mock fallback if LSL is missing:
    python scripts/aura_recorder.py --allow-mock
"""

import argparse
import asyncio
import csv
import json
import os
import signal
import sys
import time
from collections import deque
from datetime import datetime
from pathlib import Path

# Force UTF-8 stdout/stderr so non-ASCII characters don't crash on Windows
# locales like cp932 (Japanese) or cp1252.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

import numpy as np

try:
    from pylsl import StreamInlet, resolve_byprop
    HAVE_LSL = True
except Exception:
    HAVE_LSL = False

try:
    import websockets
except ImportError:
    print("[aura] missing dependency: pip install websockets", file=sys.stderr)
    sys.exit(1)

try:
    from scipy.signal import welch
    HAVE_SCIPY = True
except Exception:
    HAVE_SCIPY = False

ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = ROOT / "output"
OUTPUT_DIR.mkdir(exist_ok=True)

HOST = "127.0.0.1"
PORT = int(os.environ.get("RECORDER_PORT", "8765"))

# Channel mapping: AURA ch1..ch8 → F3, F4, Fz, Cz, Pz, P3, P4, Oz
CH = {"F3": 0, "F4": 1, "Fz": 2, "Cz": 3, "Pz": 4, "P3": 5, "P4": 6, "Oz": 7}

BANDS = {
    "theta": (4, 8),
    "alpha": (8, 13),
    "beta":  (13, 30),
}


def band_power(x, fs, band):
    if HAVE_SCIPY:
        f, Pxx = welch(x, fs=fs, nperseg=min(len(x), int(fs * 2)))
        lo, hi = band
        mask = (f >= lo) & (f <= hi)
        if not np.any(mask):
            return 0.0
        return float(np.trapz(Pxx[mask], f[mask]))
    # naive FFT fallback
    n = len(x)
    if n < 8:
        return 0.0
    f = np.fft.rfftfreq(n, 1.0 / fs)
    P = np.abs(np.fft.rfft(x - np.mean(x))) ** 2 / n
    lo, hi = band
    mask = (f >= lo) & (f <= hi)
    if not np.any(mask):
        return 0.0
    return float(np.mean(P[mask]))


class Session:
    def __init__(self):
        self.active = False
        self.phobia_id = None
        self.experiment_id = None
        self.session_type = "hybrid"
        self.baseline_calibration_seconds = 0
        self.started_at = 0.0
        self.current_level = None
        self.auto_adaptation = True
        # Baseline reference stats (mean, std) per metric
        self.baseline_stats = None
        self.baseline_buffer = []
        # CSV record buffer
        self.records = []  # list of dicts


class Recorder:
    def __init__(self, allow_mock=False):
        self.allow_mock = allow_mock
        self.inlet = None
        self.fs = 250.0
        self.n_channels = 8
        self.buffer = deque(maxlen=int(self.fs * 8))  # ~8 s ring
        self.timestamps = deque(maxlen=int(self.fs * 8))
        self.session = Session()
        self.clients = set()
        self.loop = None

    # ---- LSL ----
    def open_stream(self):
        if not HAVE_LSL:
            if self.allow_mock:
                print("[aura] pylsl unavailable — mock mode")
                return False
            print("[aura] pylsl not installed. pip install pylsl  (and start AURA software). Is AURA running?")
            sys.exit(2)
        print('[aura] resolving LSL stream name="AURA" ...')
        streams = resolve_byprop("name", "AURA", timeout=5.0)
        if not streams:
            if self.allow_mock:
                print("[aura] no AURA stream — falling back to mock")
                return False
            print('[aura] no LSL stream named "AURA". Is the AURA software running?')
            sys.exit(3)
        self.inlet = StreamInlet(streams[0], max_buflen=60)
        info = self.inlet.info()
        self.fs = float(info.nominal_srate() or 250.0)
        self.n_channels = int(info.channel_count() or 8)
        print(f"[aura] connected: {info.name()} | {self.n_channels}ch @ {self.fs:.1f} Hz")
        if self.n_channels < 8:
            print(f"[aura] WARNING: only {self.n_channels} channels — degraded montage")
        return True

    # ---- Metrics ----
    def compute_metrics(self):
        if len(self.buffer) < self.fs * 2:
            return None
        x = np.asarray(self.buffer)  # (N, ch)
        fs = self.fs

        def ch(name):
            idx = CH.get(name, 0)
            if idx >= x.shape[1]:
                idx = 0
            return x[:, idx]

        theta_fz = band_power(ch("Fz"), fs, BANDS["theta"])
        beta_fz = band_power(ch("Fz"), fs, BANDS["beta"])
        beta_cz = band_power(ch("Cz"), fs, BANDS["beta"])
        alpha_fz = band_power(ch("Fz"), fs, BANDS["alpha"]) + 1e-9
        alpha_cz = band_power(ch("Cz"), fs, BANDS["alpha"]) + 1e-9
        ba = 0.5 * (beta_fz / alpha_fz + beta_cz / alpha_cz)

        alpha_post = np.mean([
            band_power(ch(c), fs, BANDS["alpha"]) for c in ("Pz", "P3", "P4", "Oz")
        ])
        alpha_f3 = band_power(ch("F3"), fs, BANDS["alpha"]) + 1e-9
        alpha_f4 = band_power(ch("F4"), fs, BANDS["alpha"]) + 1e-9
        faa = (alpha_f4 - alpha_f3) / (alpha_f4 + alpha_f3)

        return {
            "theta_fz": float(theta_fz),
            "beta_alpha_fz_cz": float(ba),
            "alpha_posterior": float(alpha_post),
            "faa": float(faa),
        }

    def fear_index(self, m):
        if self.session.baseline_stats is None:
            return 0.0, "hold"
        b = self.session.baseline_stats
        def z(key, val, invert=False):
            mu, sd = b.get(key, (0.0, 1.0))
            sd = sd if sd > 1e-6 else 1.0
            zv = (val - mu) / sd
            return -zv if invert else zv
        fear = 0.25 * (
            z("theta_fz", m["theta_fz"])
            + z("beta_alpha_fz_cz", m["beta_alpha_fz_cz"])
            + z("alpha_posterior", m["alpha_posterior"], invert=True)
            + z("faa", m["faa"])
        )
        suggestion = "hold"
        if fear > 1.0:
            suggestion = "down"
        elif fear < -0.3:
            suggestion = "up"
        return float(fear), suggestion

    # ---- Loops ----
    async def pull_loop(self, have_lsl):
        last_log = time.time()
        samples_since_log = 0
        while True:
            if have_lsl and self.inlet is not None:
                try:
                    # Small blocking timeout so we actually accumulate samples
                    # instead of busy-polling empty buffers.
                    samples, ts = self.inlet.pull_chunk(timeout=0.2, max_samples=256)
                except Exception as e:
                    print("[aura] pull_chunk error:", e)
                    samples, ts = [], []
                if samples:
                    samples_since_log += len(samples)
                    for s, t in zip(samples, ts):
                        self.buffer.append(s)
                        self.timestamps.append(t)
                        if self.session.active:
                            rec = {
                                "ts": t,
                                "level": self.session.current_level,
                                "phobia_id": self.session.phobia_id,
                            }
                            for i, v in enumerate(s):
                                rec[f"ch{i+1}"] = v
                            self.session.records.append(rec)
                # Heartbeat: print sample rate every ~5s so user sees data flowing
                now = time.time()
                if now - last_log >= 5.0:
                    rate = samples_since_log / (now - last_log)
                    print(f"[aura] samples last 5s: {samples_since_log} ({rate:.1f} Hz), buffer={len(self.buffer)}")
                    samples_since_log = 0
                    last_log = now
            else:
                # mock samples (synthetic fallback)
                if self.session.active:
                    n = 16
                    fake = np.random.randn(n, 8) * 5.0
                    for s in fake:
                        self.buffer.append(s.tolist())
                        self.timestamps.append(time.time())
                        rec = {"ts": time.time(), "level": self.session.current_level, "phobia_id": self.session.phobia_id}
                        for i, v in enumerate(s):
                            rec[f"ch{i+1}"] = float(v)
                        self.session.records.append(rec)
            await asyncio.sleep(0.05 if have_lsl else 0.02)

    async def adaptive_loop(self):
        while True:
            await asyncio.sleep(2.0)
            if not self.session.active:
                continue

            t = time.time() - self.session.started_at
            in_cal = t < self.session.baseline_calibration_seconds
            metrics = self.compute_metrics()

            # If we don't have enough samples yet, still emit a diagnostic state
            # so the researcher panel shows something rather than a frozen "--".
            if metrics is None:
                await self.broadcast({
                    "type": "adaptive_state",
                    "fear_index": 0.0,
                    "level_suggestion": "hold",
                    "current_level": self.session.current_level,
                    "adaptive_phase": "warmup",
                    "baseline_remaining_s": max(0.0, self.session.baseline_calibration_seconds - t),
                    "metrics": {
                        "theta_fz": float("nan"),
                        "beta_alpha_fz_cz": float("nan"),
                        "alpha_posterior": float("nan"),
                        "faa": float("nan"),
                    },
                    "diagnostic": {
                        "buffer_samples": len(self.buffer),
                        "needed_samples": int(self.fs * 2),
                        "records": len(self.session.records),
                    },
                    "source": "aura",
                    "ts": time.time(),
                })
                continue

            if in_cal:
                self.session.baseline_buffer.append(metrics)
                phase = "calibration"
                fear, suggestion = 0.0, "hold"
            else:
                if self.session.baseline_stats is None and self.session.baseline_buffer:
                    arr = {k: np.array([d[k] for d in self.session.baseline_buffer])
                           for k in self.session.baseline_buffer[0]}
                    self.session.baseline_stats = {
                        k: (float(v.mean()), float(v.std())) for k, v in arr.items()
                    }
                fear, suggestion = self.fear_index(metrics)
                phase = "adaptation"

            await self.broadcast({
                "type": "adaptive_state",
                "fear_index": fear,
                "level_suggestion": suggestion,
                "current_level": self.session.current_level,
                "adaptive_phase": phase,
                "baseline_remaining_s": max(0.0, self.session.baseline_calibration_seconds - t) if in_cal else 0.0,
                "metrics": metrics,
                "diagnostic": {
                    "buffer_samples": len(self.buffer),
                    "records": len(self.session.records),
                },
                "source": "aura",
                "ts": time.time(),
            })

    # ---- WebSocket ----
    async def broadcast(self, obj):
        if not self.clients:
            return
        msg = json.dumps(obj)
        dead = []
        for c in list(self.clients):
            try:
                await c.send(msg)
            except Exception:
                dead.append(c)
        for c in dead:
            self.clients.discard(c)

    async def handler(self, ws):
        self.clients.add(ws)
        print("[aura] bridge connected")
        try:
            await ws.send(json.dumps({"type": "recorder_ready", "source": "aura"}))
            async for raw in ws:
                try:
                    m = json.loads(raw)
                except Exception:
                    continue
                await self.handle_msg(ws, m)
        except websockets.ConnectionClosed:
            pass
        finally:
            self.clients.discard(ws)
            print("[aura] bridge disconnected")

    async def handle_msg(self, ws, m):
        t = m.get("type")
        if t == "controller_start":
            self.session = Session()
            self.session.active = True
            self.session.phobia_id = m.get("phobia_id")
            self.session.experiment_id = m.get("experiment_id") or f"exp_{int(time.time())}"
            self.session.session_type = m.get("session_type", "hybrid")
            self.session.baseline_calibration_seconds = int(m.get("baseline_calibration_seconds") or 0)
            self.session.current_level = m.get("level", 0)
            self.session.started_at = time.time()
            await ws.send(json.dumps({
                "type": "start_experiment",
                "phobia_id": self.session.phobia_id,
                "phobia_name": m.get("phobia_name"),
                "level": self.session.current_level,
                "experiment_id": self.session.experiment_id,
                "duration_seconds": m.get("duration_seconds") or 0,
                "session_type": self.session.session_type,
                "baseline_calibration_seconds": self.session.baseline_calibration_seconds,
                "source": "aura",
                "ts": time.time(),
            }))
            print(f"[aura] session started: {self.session.experiment_id} · {self.session.phobia_id} L{self.session.current_level}")
        elif t == "manual_level":
            self.session.current_level = m.get("level")
            await ws.send(json.dumps({"type": "force_level", "level": self.session.current_level, "source": "aura"}))
        elif t == "set_auto_adaptation":
            self.session.auto_adaptation = bool(m.get("enabled"))
            await ws.send(json.dumps({"type": "auto_adaptation_toggle", "enabled": self.session.auto_adaptation}))
        elif t == "level_change":
            self.session.current_level = m.get("level")
            # Echo so the researcher panel reflects the auto-adapted level
            await ws.send(json.dumps({"type": "force_level", "level": m.get("level"), "source": "aura", "auto": True}))
        elif t in ("stop", "stop_video"):
            print(f"[aura] stop received -- saving CSV (records={len(self.session.records)})")
            self.save_csv()
            self.session.active = False
            await ws.send(json.dumps({"type": "stop_video", "source": "aura"}))

    def save_csv(self):
        eid = self.session.experiment_id or f"exp_{int(time.time())}"
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        path = OUTPUT_DIR / f"{eid}_{ts}.csv"
        n = len(self.session.records)
        if n == 0:
            # Still write an empty file so the user sees the path and knows the
            # session ran without any EEG samples (helps diagnose AURA setup).
            with open(path, "w", newline="") as f:
                f.write("ts,level,phobia_id,ch1,ch2,ch3,ch4,ch5,ch6,ch7,ch8\n")
            print(f"[aura] CSV saved (EMPTY, 0 samples received): {path}")
            print("[aura] -> AURA stream resolved but no data arrived. Check the AURA software is actually streaming.")
            return
        keys = list(self.session.records[0].keys())
        with open(path, "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=keys)
            w.writeheader()
            w.writerows(self.session.records)
        print(f"[aura] CSV saved: {path}  ({n} samples)")


async def main_async(allow_mock):
    rec = Recorder(allow_mock=allow_mock)
    have_lsl = rec.open_stream()
    server = await websockets.serve(rec.handler, HOST, PORT)
    print(f"[aura] ws://{HOST}:{PORT} ready")
    tasks = [
        asyncio.create_task(rec.pull_loop(have_lsl)),
        asyncio.create_task(rec.adaptive_loop()),
    ]
    try:
        await asyncio.Future()
    finally:
        for t in tasks:
            t.cancel()
        server.close()
        await server.wait_closed()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--allow-mock", action="store_true", help="fall back to synthetic EEG if LSL/AURA missing")
    args = ap.parse_args()
    try:
        asyncio.run(main_async(args.allow_mock))
    except KeyboardInterrupt:
        print("\n[aura] stopped")


if __name__ == "__main__":
    main()
