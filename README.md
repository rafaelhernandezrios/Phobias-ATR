# VR Phobia Exposure · IKAN

**360° phobia exposure platform** with two web views:

- **Researcher** (PC / Chrome or Edge): session control panel and live EEG metrics.
- **Participant / Quest 3** (`/participant` → `/wait?vr=1`): consent → VR wait → 360° video driven by the researcher.

Production EEG: **AURA** headset via **LSL** (stream `"AURA"`, 8 channels @ ~250 Hz). A mock recorder is included for testing without the headset.

## Architecture

```
Browser (Quest / Researcher)  ──wss──►  HTTPS server (Node, 8443)
                                                │
                                                ▼  ws://127.0.0.1:8765
                                       Recorder (Python AURA · LSL)
                                       or Mock (Node)
```

## USB / locked-down PC (no downloads on lab machine)

The researcher panel is **web-only** (`https://localhost:8443/researcher`) — no PyQt, no Electron.

On a PC **with internet** (once), in the project folder:

```cmd
prepare-usb.bat
```

This downloads portable Node to `tools/node/`, runs `npm install`, generates the TLS cert, and (optionally) builds the Python venv for AURA. Copy the **entire folder** to a USB drive.

On the **lab PC** (no npm/pip/Electron needed):

| Goal | Double-click |
|---|---|
| Test without headset | `run-experiment-mock.bat` |
| Real AURA session | `run-experiment.bat` |
| Open panel only | `researcher.bat` |

Mock mode needs **only** the files on the USB (Node bundled in `tools/node/`). Real AURA still needs the `.venv` prepared on a Windows machine beforehand.

The browser opens the researcher panel automatically. Accept the self-signed cert warning once.

## Quick start (Windows 10/11)

1. Install **Node LTS** from nodejs.org (check "Add to PATH").
2. From `cmd.exe` in the project folder:
   ```cmd
   npm install
   ```
3. **Only if using real AURA:** install Python 3.10+ ("Add to PATH") and:
   ```cmd
   npm run setup:python
   ```
4. Connect to the lab Wi-Fi and generate the TLS cert (it embeds the current LAN IP):
   ```cmd
   npm run cert
   ```
5. Open the port in the firewall (right-click → Run as Administrator):
   ```cmd
   scripts\open-firewall-windows.cmd
   ```
6. Launch:
   - **With AURA (production):** power the headset and start the AURA software (LSL stream `"AURA"` must be active), then run `run-experiment.bat`.
   - **Without the headset (testing):** `run-experiment-mock.bat`.
7. Find your LAN IP (`ipconfig` → Wi-Fi adapter). Then open:
   - **Researcher:** `https://<LAN-IP>:8443/researcher`
   - **Quest 3 (participant):** `https://<LAN-IP>:8443/participant` → accept the cert exception once → consent → VR wait.

## Session flow

1. Participant accepts consent → arrives at the VR "Waiting for researcher" scene.
2. Researcher picks **phobia / initial level / duration / baseline calibration (s)** and presses **Start**.
3. Participant sees the corresponding 360° video.
4. Researcher can press **levels 0–5** for instant change, or let the EEG suggest up/hold/down (`hybrid` with auto-adaptation ON).
5. **Stop** halts the video and (with AURA) writes a CSV in `output/`.

## Layout

```
server/server.js          HTTPS 8443 + WS hub /ws + static + content API
public/                   index, researcher, participant (consent), wait (VR + 360 sphere)
data/content.json         phobia/level -> MP4 mapping in videos/
videos/                   30 360° videos (5 phobias × 6 levels) + baseline.mp4
scripts/aura_recorder.py  Python recorder (LSL AURA + fear index + CSV)
scripts/mock_recorder.js  Mock recorder (no headset)
scripts/run-experiment.js Orchestrator (recorder + HTTPS)
scripts/generate-cert.js  Self-signed cert with SAN including LAN IP
scripts/test-ws.js        WS smoke test
prepare-usb.bat           One-time prep for offline USB (downloads deps)
run-experiment.bat        Windows shortcut (AURA)
run-experiment-mock.bat   Windows shortcut (mock)
researcher.bat            Open web panel in browser
output/                   session CSVs
```

## WebSocket protocol (`wss://<host>:8443/ws`)

See section 4 of [`ESPECIFICACION_PROYECTO_VR_FOBIA.md`](ESPECIFICACION_PROYECTO_VR_FOBIA.md). Summary:

Client → server: `controller_start`, `manual_level`, `set_auto_adaptation`, `level_change`, `stop`.
Server → clients: `recorder_ready`, `start_experiment`, `force_level`, `adaptive_state`, `auto_adaptation_toggle`, `stop_video`, `recorder_error`.

## Quick smoke test

While the system is running:
```cmd
node scripts\test-ws.js
```
Expected: `OK: participant got start_experiment ...`.

## macOS / Linux (development)

Works, but the `.bat` files don't apply. Use:
```bash
npm install
npm run setup:python   # optional, if testing the AURA recorder
npm run cert
npm run experiment      # with AURA (LSL)
# or
npm run experiment:mock # without the headset
```

## Troubleshooting

| Symptom | Action |
|---|---|
| Other devices on the LAN cannot reach `https://<IP>:8443` | See **LAN access** section below. |
| Quest can't load the URL | Same Wi-Fi; firewall 8443; cert with current LAN IP (`npm run cert`). |
| WS connected but no video | Make sure recorder is alive; UI should show `recorder_ready`. |
| Python: `pylsl` missing | `npm run setup:python` (needs Python 3 + pip on PATH). |
| `Is AURA running?` | Start AURA + its software so LSL stream `"AURA"` is visible BEFORE launching. |
| Video autoplay blocked | Tap the "Tap to start video" overlay on the Quest. |

## LAN access — when other devices on the same Wi-Fi can't reach the server

The server listens on `0.0.0.0:8443` (all interfaces). If another machine on the same Wi-Fi can't connect, the cause is almost always one of:

1. **Windows Firewall** — rule missing or wrong profile.
2. **Network profile = Public** — Windows blocks inbound traffic on Public networks by default.
3. **AP/client isolation on the Wi-Fi router** — common on guest SSIDs and many corporate APs. Clients can reach the internet but not each other. No software fix possible.
4. **Antivirus/EDR** blocking inbound TCP.

### Diagnostic steps (in order)

On the **server PC**:
```cmd
ipconfig
netstat -an | findstr :8443
```
The second command must show `0.0.0.0:8443  LISTENING`.

From **another device** on the same Wi-Fi:
```cmd
ping <server-LAN-IP>
```
- **Ping fails** → AP isolation or different subnet. Fix at the router or use a different network.
- **Ping works, browser fails** → firewall or antivirus on the server.

### Fixes to try

1. Re-run `scripts\open-firewall-windows.cmd` as Administrator (it now opens TCP 8443 for **all profiles** — domain/private/public).
2. Set the Wi-Fi profile to Private:
   ```powershell
   Set-NetConnectionProfile -InterfaceAlias "Wi-Fi" -NetworkCategory Private
   ```
3. Temporarily disable Windows Firewall to confirm the cause:
   ```cmd
   netsh advfirewall set allprofiles state off
   ```
   (Re-enable with `on` immediately after testing.)
4. Disable antivirus inbound rules briefly and retest.

### Recommended fallbacks if the LAN keeps blocking you

- **Use a phone hotspot or a personal travel router** for the lab session. Connect server PC + Quest + visitor PCs to it. This bypasses corporate AP isolation entirely. This is what you mentioned wanting to try with a modem and is by far the most reliable fix in shared/IT-managed Wi-Fi.
- **Bring a small consumer Wi-Fi router** (e.g. GL.iNet pocket router) configured for the lab. Same idea, dedicated SSID, no IT involvement.
- **Wired tethering** (server PC tethered to the same hotspot via USB) gives a stable LAN with the Quest on Wi-Fi from the same hotspot.
- **Cloudflare Tunnel / ngrok / tailscale-funnel** as a last resort (puts the HTTPS server on a public URL with a valid cert). Avoids cert issues on the Quest too, but adds latency — not ideal for live EEG sync.
- **Tailscale mesh** (free for small teams): each device installs Tailscale and gets a private 100.x address that works across networks. Good for remote demos.

For the lab, **option 1 (hotspot/portable router)** is what I'd recommend first: it's the simplest, removes IT dependency, and is the same setup the spec assumes (server + Quest on a private SSID).
