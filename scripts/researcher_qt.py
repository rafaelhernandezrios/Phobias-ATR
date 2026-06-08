"""
Native PyQt6 researcher panel for VR Phobia Exposure / IKAN.

Connects to the WebSocket hub at wss://<host>:8443/ws (defaults to localhost)
and mirrors the features of the web /researcher page, with a modern dark UI.

Run:
    .venv\\Scripts\\python.exe scripts\\researcher_qt.py
    or
    researcher.bat
"""

from __future__ import annotations

import json
import sys
import time
import urllib.request
import ssl
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

try:
    from PyQt6 import QtCore, QtGui, QtWidgets
    from PyQt6.QtCore import Qt, QUrl, QTimer
    from PyQt6.QtNetwork import QSslConfiguration, QSslSocket, QSsl
    from PyQt6.QtWebSockets import QWebSocket
except ImportError as e:
    print("PyQt6 missing. Run:  npm run setup:python", file=sys.stderr)
    print("(or)  pip install PyQt6", file=sys.stderr)
    print(f"Original error: {e}", file=sys.stderr)
    sys.exit(1)


# ----- helpers ------------------------------------------------------------- #

DEFAULT_HOST = "localhost"
DEFAULT_PORT = 8443

SESSION_TYPES = [("hybrid", "hybrid (manual + EEG)"), ("auto_sequence", "auto_sequence (0->5)")]


@dataclass
class Phobia:
    id: str
    name: str
    name_es: Optional[str] = None


def load_content(host: str, port: int) -> list[Phobia]:
    """Fetch /api/content from the HTTPS server (ignores self-signed cert)."""
    url = f"https://{host}:{port}/api/content"
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    try:
        with urllib.request.urlopen(url, context=ctx, timeout=4.0) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        print(f"[researcher_qt] could not fetch content.json: {e}", file=sys.stderr)
        # fall back to a stub
        return [
            Phobia("arachnophobia", "Arachnophobia", "Aracnofobia"),
            Phobia("claustrophobia", "Claustrophobia", "Claustrofobia"),
            Phobia("acrophobia", "Acrophobia", "Acrofobia"),
            Phobia("ophidiophobia", "Ophidiophobia", "Ofidiofobia"),
            Phobia("entomophobia", "Entomophobia", "Entomofobia"),
        ]
    out: list[Phobia] = []
    for p in data.get("phobias", []):
        out.append(Phobia(id=p["id"], name=p.get("name", p["id"]), name_es=p.get("name_es")))
    return out


# ----- styling ------------------------------------------------------------- #

QSS = """
* { font-family: "Segoe UI", "SF Pro Text", Arial, sans-serif; font-size: 13px; color: #e7e9ee; }
QMainWindow, QWidget#root { background-color: #0f1115; }
QFrame#card {
    background-color: #161a22;
    border: 1px solid #232634;
    border-radius: 10px;
    padding: 14px;
}
QLabel#h1 { font-size: 18px; font-weight: 600; }
QLabel#h2 { font-size: 14px; font-weight: 600; color: #cfd3dc; }
QLabel.k  { font-size: 11px; color: #8a8f9c; text-transform: uppercase; letter-spacing: 0.06em; }
QLabel.v  { font-size: 18px; font-weight: 600; color: #e7e9ee; }
QLabel#hint { color: #8a8f9c; font-size: 12px; }

QLineEdit, QSpinBox, QComboBox {
    background-color: #0f1218;
    border: 1px solid #2a2f3d;
    border-radius: 6px;
    padding: 7px 9px;
    selection-background-color: #2e5fff;
}
QComboBox::drop-down { border: none; width: 22px; }
QComboBox QAbstractItemView { background-color: #161a22; border: 1px solid #2a2f3d; selection-background-color: #2e5fff; }

QPushButton {
    background-color: #1d212c;
    border: 1px solid #2a2f3d;
    border-radius: 6px;
    padding: 8px 14px;
}
QPushButton:hover { background-color: #262b38; }
QPushButton:pressed { background-color: #2e3344; }
QPushButton#primary { background-color: #2e5fff; border-color: #2e5fff; font-weight: 600; }
QPushButton#primary:hover { background-color: #4571ff; }
QPushButton#danger { background-color: #8a1f2b; border-color: #8a1f2b; font-weight: 600; }
QPushButton#danger:hover { background-color: #a32634; }
QPushButton.level { font-size: 16px; font-weight: 600; padding: 14px 0; }
QPushButton.level[active="true"] { background-color: #2e5fff; border-color: #2e5fff; }

QCheckBox { spacing: 8px; }
QCheckBox::indicator {
    width: 16px; height: 16px;
    border-radius: 4px;
    border: 1px solid #2a2f3d;
    background-color: #0f1218;
}
QCheckBox::indicator:checked { background-color: #2e5fff; border-color: #2e5fff; }

QPlainTextEdit {
    background-color: #0f1218;
    border: 1px solid #232634;
    border-radius: 6px;
    font-family: "Cascadia Mono", "Consolas", "Menlo", monospace;
    font-size: 12px;
    color: #cfd3dc;
    padding: 6px;
}

QStatusBar { color: #8a8f9c; }

QFrame#dotOff { background-color: #6b7280; border-radius: 6px; min-width: 12px; max-width: 12px; min-height: 12px; max-height: 12px; }
QFrame#dotOn  { background-color: #3fd07a; border-radius: 6px; min-width: 12px; max-width: 12px; min-height: 12px; max-height: 12px; }
"""


def make_card(title: str) -> tuple[QtWidgets.QFrame, QtWidgets.QVBoxLayout]:
    card = QtWidgets.QFrame()
    card.setObjectName("card")
    layout = QtWidgets.QVBoxLayout(card)
    layout.setContentsMargins(14, 14, 14, 14)
    layout.setSpacing(10)
    if title:
        h = QtWidgets.QLabel(title)
        h.setObjectName("h2")
        layout.addWidget(h)
    return card, layout


def metric_widget(label: str) -> tuple[QtWidgets.QFrame, QtWidgets.QLabel]:
    frame = QtWidgets.QFrame()
    frame.setStyleSheet("QFrame { background-color: #0f1218; border: 1px solid #232634; border-radius: 6px; }")
    v = QtWidgets.QVBoxLayout(frame)
    v.setContentsMargins(10, 8, 10, 8)
    v.setSpacing(2)
    k = QtWidgets.QLabel(label.upper())
    k.setProperty("class", "k")
    k.setStyleSheet("color:#8a8f9c; font-size:11px; letter-spacing:0.06em;")
    val = QtWidgets.QLabel("--")
    val.setProperty("class", "v")
    val.setStyleSheet("color:#e7e9ee; font-size:18px; font-weight:600;")
    v.addWidget(k)
    v.addWidget(val)
    return frame, val


# ----- main window --------------------------------------------------------- #

class ResearcherWindow(QtWidgets.QMainWindow):
    def __init__(self, host: str, port: int):
        super().__init__()
        self.host = host
        self.port = port
        self.phobias: list[Phobia] = []
        self.current_level: Optional[int] = None
        self.ws_connected = False
        self.recorder_ready = False

        self.setWindowTitle("VR Phobia - Researcher (PyQt)")
        self.resize(1080, 740)
        self._build_ui()
        self._build_ws()
        self._refresh_content()

        # Auto-reconnect timer
        self.reconnect_timer = QTimer(self)
        self.reconnect_timer.setInterval(2000)
        self.reconnect_timer.timeout.connect(self._try_connect_ws)

        self._try_connect_ws()

    # ---- UI ---- #

    def _build_ui(self):
        central = QtWidgets.QWidget()
        central.setObjectName("root")
        self.setCentralWidget(central)
        root = QtWidgets.QVBoxLayout(central)
        root.setContentsMargins(18, 14, 18, 14)
        root.setSpacing(12)

        # Header
        header = QtWidgets.QHBoxLayout()
        title = QtWidgets.QLabel("Researcher panel")
        title.setObjectName("h1")
        header.addWidget(title)
        header.addStretch(1)

        # Connection chips
        self.ws_dot = QtWidgets.QFrame(); self.ws_dot.setObjectName("dotOff")
        self.ws_label = QtWidgets.QLabel("WS disconnected")
        self.rec_dot = QtWidgets.QFrame(); self.rec_dot.setObjectName("dotOff")
        self.rec_label = QtWidgets.QLabel("recorder offline")
        for w in (self.ws_dot, self.ws_label, self.rec_dot, self.rec_label):
            header.addWidget(w)

        # Host:port edit
        self.host_edit = QtWidgets.QLineEdit(f"{self.host}:{self.port}")
        self.host_edit.setFixedWidth(180)
        self.host_edit.editingFinished.connect(self._on_host_changed)
        header.addSpacing(12)
        header.addWidget(QtWidgets.QLabel("Server:"))
        header.addWidget(self.host_edit)

        root.addLayout(header)

        # Grid: top row = Session + Control
        top_row = QtWidgets.QHBoxLayout()
        top_row.setSpacing(12)
        top_row.addWidget(self._build_session_card(), 1)
        top_row.addWidget(self._build_control_card(), 1)
        root.addLayout(top_row)

        # Metrics card spans
        root.addWidget(self._build_metrics_card())

        # Log card
        root.addWidget(self._build_log_card(), 1)

        # Status bar
        self.statusBar().showMessage("Ready")

    def _build_session_card(self) -> QtWidgets.QFrame:
        card, lay = make_card("Session")
        form = QtWidgets.QFormLayout()
        form.setLabelAlignment(Qt.AlignmentFlag.AlignLeft)
        form.setFormAlignment(Qt.AlignmentFlag.AlignTop)
        form.setHorizontalSpacing(12)
        form.setVerticalSpacing(8)

        self.phobia_combo = QtWidgets.QComboBox()
        form.addRow("Phobia", self.phobia_combo)

        self.level_combo = QtWidgets.QComboBox()
        self.level_combo.addItems(["0 - baseline", "1", "2", "3", "4", "5"])
        form.addRow("Initial level", self.level_combo)

        self.exp_id = QtWidgets.QLineEdit()
        self.exp_id.setPlaceholderText(f"exp_{time.strftime('%Y_%m_%d_%H%M')}")
        form.addRow("Experiment ID", self.exp_id)

        self.duration = QtWidgets.QSpinBox()
        self.duration.setRange(0, 24 * 3600); self.duration.setValue(300); self.duration.setSuffix(" s")
        form.addRow("Duration", self.duration)

        self.session_type = QtWidgets.QComboBox()
        for key, label in SESSION_TYPES:
            self.session_type.addItem(label, key)
        form.addRow("Session type", self.session_type)

        self.baseline_cal = QtWidgets.QSpinBox()
        self.baseline_cal.setRange(0, 600); self.baseline_cal.setValue(10); self.baseline_cal.setSuffix(" s")
        form.addRow("Baseline calibration", self.baseline_cal)

        hint = QtWidgets.QLabel("0 to skip calibration, 45 for production sessions.")
        hint.setObjectName("hint")
        form.addRow("", hint)

        lay.addLayout(form)
        return card

    def _build_control_card(self) -> QtWidgets.QFrame:
        card, lay = make_card("Control")
        row = QtWidgets.QHBoxLayout()
        self.btn_start = QtWidgets.QPushButton("Start experiment")
        self.btn_start.setObjectName("primary")
        self.btn_start.clicked.connect(self.send_start)
        self.btn_stop = QtWidgets.QPushButton("Stop")
        self.btn_stop.setObjectName("danger")
        self.btn_stop.clicked.connect(lambda: self.send({"type": "stop"}))
        row.addWidget(self.btn_start)
        row.addWidget(self.btn_stop)
        row.addStretch(1)
        lay.addLayout(row)

        self.adapt = QtWidgets.QCheckBox("Auto adaptation (EEG)")
        self.adapt.setChecked(True)
        self.adapt.stateChanged.connect(
            lambda s: self.send({"type": "set_auto_adaptation", "enabled": self.adapt.isChecked()})
        )
        lay.addWidget(self.adapt)

        sub = QtWidgets.QLabel("Manual levels")
        sub.setObjectName("h2")
        lay.addWidget(sub)

        lvl_row = QtWidgets.QHBoxLayout()
        lvl_row.setSpacing(6)
        self.level_buttons: list[QtWidgets.QPushButton] = []
        for i in range(6):
            b = QtWidgets.QPushButton(str(i))
            b.setProperty("class", "level")
            b.setStyleSheet("QPushButton { padding: 14px 0; font-size: 16px; font-weight: 600; }"
                            "QPushButton[active='true'] { background-color: #2e5fff; border-color: #2e5fff; }")
            b.clicked.connect(lambda _, lvl=i: self.send({"type": "manual_level", "level": lvl}))
            lvl_row.addWidget(b, 1)
            self.level_buttons.append(b)
        lay.addLayout(lvl_row)

        self.active_label = QtWidgets.QLabel("Active level: --")
        self.active_label.setObjectName("hint")
        lay.addWidget(self.active_label)
        lay.addStretch(1)
        return card

    def _build_metrics_card(self) -> QtWidgets.QFrame:
        card, lay = make_card("EEG / AURA - live metrics")
        grid = QtWidgets.QGridLayout()
        grid.setHorizontalSpacing(10); grid.setVerticalSpacing(10)

        self.m: dict[str, QtWidgets.QLabel] = {}
        names = [
            ("Phase", "phase"),
            ("Fear / Engagement", "fear"),
            ("Suggestion", "sugg"),
            ("theta Fz", "theta"),
            ("beta/alpha (Fz,Cz)", "ba"),
            ("alpha posterior", "ap"),
            ("FAA", "faa"),
            ("Baseline remaining", "baseline"),
            ("EEG buffer (samples)", "buf"),
            ("Records saved", "rec"),
        ]
        cols = 5
        for idx, (label, key) in enumerate(names):
            frame, val = metric_widget(label)
            self.m[key] = val
            grid.addWidget(frame, idx // cols, idx % cols)
        lay.addLayout(grid)
        return card

    def _build_log_card(self) -> QtWidgets.QFrame:
        card, lay = make_card("Log")
        self.log = QtWidgets.QPlainTextEdit()
        self.log.setReadOnly(True)
        self.log.setMaximumBlockCount(500)
        lay.addWidget(self.log, 1)
        return card

    # ---- content ---- #

    def _refresh_content(self):
        try:
            self.phobias = load_content(self.host, self.port)
        except Exception as e:
            self.log_line(f"could not load content: {e}")
            self.phobias = []
        self.phobia_combo.clear()
        for p in self.phobias:
            self.phobia_combo.addItem(p.name_es or p.name, p.id)

    def _on_host_changed(self):
        txt = self.host_edit.text().strip()
        if ":" in txt:
            h, p = txt.split(":", 1)
            try:
                p = int(p)
            except ValueError:
                p = self.port
        else:
            h, p = txt, self.port
        self.host, self.port = h, p
        self.log_line(f"server target changed to {self.host}:{self.port}")
        self._refresh_content()
        self.ws.close()
        self._try_connect_ws()

    # ---- WS ---- #

    def _build_ws(self):
        self.ws = QWebSocket()
        # Accept the lab's self-signed cert
        cfg = QSslConfiguration.defaultConfiguration()
        cfg.setPeerVerifyMode(QSslSocket.PeerVerifyMode.VerifyNone)
        self.ws.setSslConfiguration(cfg)
        self.ws.sslErrors.connect(lambda errs: self.ws.ignoreSslErrors())
        self.ws.connected.connect(self._on_ws_open)
        self.ws.disconnected.connect(self._on_ws_close)
        self.ws.errorOccurred.connect(self._on_ws_error)
        self.ws.textMessageReceived.connect(self._on_ws_msg)

    def _try_connect_ws(self):
        if self.ws.state() != QtCore.QAbstractSocket.SocketState.UnconnectedState:
            return
        url = QUrl(f"wss://{self.host}:{self.port}/ws")
        self.log_line(f"connecting to {url.toString()}")
        self.ws.open(url)

    def _on_ws_open(self):
        self.ws_connected = True
        self._set_dot(self.ws_dot, self.ws_label, True, "WS connected")
        self.log_line("WS open")
        self.reconnect_timer.stop()

    def _on_ws_close(self):
        self.ws_connected = False
        self.recorder_ready = False
        self._set_dot(self.ws_dot, self.ws_label, False, "WS disconnected")
        self._set_dot(self.rec_dot, self.rec_label, False, "recorder offline")
        self.log_line("WS closed - retrying in 2s")
        self.reconnect_timer.start()

    def _on_ws_error(self, err):
        self.log_line(f"WS error: {err}")

    def _on_ws_msg(self, text: str):
        try:
            m = json.loads(text)
        except Exception:
            return
        t = m.get("type")
        if t == "recorder_ready":
            self.recorder_ready = True
            self._set_dot(self.rec_dot, self.rec_label, True, f"recorder OK ({m.get('source','?')})")
            self.log_line("recorder ready")
        elif t == "recorder_error":
            self.recorder_ready = False
            self._set_dot(self.rec_dot, self.rec_label, False, m.get("message", "recorder offline"))
            self.log_line(f"recorder error: {m.get('message','')}")
        elif t == "status":
            self.log_line(f"status: {m.get('status')}")
        elif t == "start_experiment":
            self._set_active_level(m.get("level"))
            self.log_line(f"start_experiment {m.get('phobia_id')} L{m.get('level')}")
        elif t == "force_level":
            lvl = m.get("level")
            self._set_active_level(lvl)
            extra = " (auto)" if m.get("auto") else ""
            self.log_line(f"force_level {lvl}{extra}")
        elif t == "stop_video":
            self._set_active_level(None)
            self.log_line("stop_video")
        elif t == "adaptive_state":
            self._render_adaptive(m)

    def _render_adaptive(self, m: dict):
        def f(v, d=2):
            if v is None: return "--"
            try:
                if v != v:  # NaN check
                    return "--"
            except Exception:
                pass
            try:
                return f"{float(v):.{d}f}"
            except Exception:
                return "--"

        self.m["phase"].setText(m.get("adaptive_phase") or "--")
        self.m["fear"].setText(f(m.get("fear_index")))
        self.m["sugg"].setText(m.get("level_suggestion") or "--")
        met = m.get("metrics") or {}
        self.m["theta"].setText(f(met.get("theta_fz")))
        self.m["ba"].setText(f(met.get("beta_alpha_fz_cz")))
        self.m["ap"].setText(f(met.get("alpha_posterior")))
        self.m["faa"].setText(f(met.get("faa")))
        br = m.get("baseline_remaining_s")
        self.m["baseline"].setText(f"{f(br, 0)} s" if br is not None else "--")
        d = m.get("diagnostic") or {}
        self.m["buf"].setText(str(d.get("buffer_samples", "--")))
        self.m["rec"].setText(str(d.get("records", "--")))

    def _set_active_level(self, level: Optional[int]):
        self.current_level = level
        self.active_label.setText(f"Active level: {level if level is not None else '--'}")
        for i, b in enumerate(self.level_buttons):
            b.setProperty("active", "true" if level is not None and i == level else "false")
            b.style().unpolish(b)
            b.style().polish(b)

    def _set_dot(self, dot: QtWidgets.QFrame, label: QtWidgets.QLabel, on: bool, text: str):
        dot.setObjectName("dotOn" if on else "dotOff")
        dot.style().unpolish(dot); dot.style().polish(dot)
        label.setText(text)

    # ---- send ---- #

    def send(self, obj: dict):
        if not self.ws_connected:
            self.log_line("WS not connected")
            return
        self.ws.sendTextMessage(json.dumps(obj))

    def send_start(self):
        phobia_id = self.phobia_combo.currentData() or "arachnophobia"
        phobia_name = self.phobia_combo.currentText() or phobia_id
        self.send({
            "type": "controller_start",
            "phobia_id": phobia_id,
            "phobia_name": phobia_name,
            "level": self.level_combo.currentIndex(),
            "experiment_id": self.exp_id.text().strip() or self.exp_id.placeholderText(),
            "duration_seconds": int(self.duration.value()),
            "session_type": self.session_type.currentData(),
            "baseline_calibration_seconds": int(self.baseline_cal.value()),
        })

    # ---- log ---- #

    def log_line(self, msg: str):
        ts = time.strftime("%H:%M:%S")
        self.log.appendPlainText(f"[{ts}] {msg}")


def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default=DEFAULT_HOST)
    ap.add_argument("--port", type=int, default=DEFAULT_PORT)
    args = ap.parse_args()

    app = QtWidgets.QApplication(sys.argv)
    app.setStyle("Fusion")
    app.setStyleSheet(QSS)
    # Modern fusion palette darkened
    pal = app.palette()
    pal.setColor(QtGui.QPalette.ColorRole.Window, QtGui.QColor("#0f1115"))
    pal.setColor(QtGui.QPalette.ColorRole.Base, QtGui.QColor("#161a22"))
    pal.setColor(QtGui.QPalette.ColorRole.Text, QtGui.QColor("#e7e9ee"))
    pal.setColor(QtGui.QPalette.ColorRole.WindowText, QtGui.QColor("#e7e9ee"))
    pal.setColor(QtGui.QPalette.ColorRole.Button, QtGui.QColor("#1d212c"))
    pal.setColor(QtGui.QPalette.ColorRole.ButtonText, QtGui.QColor("#e7e9ee"))
    pal.setColor(QtGui.QPalette.ColorRole.Highlight, QtGui.QColor("#2e5fff"))
    pal.setColor(QtGui.QPalette.ColorRole.HighlightedText, QtGui.QColor("#ffffff"))
    app.setPalette(pal)

    win = ResearcherWindow(args.host, args.port)
    win.show()
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
