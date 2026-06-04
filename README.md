# VR Phobia Exposure · IKAN

Plataforma de **exposición a fobias en VR (360°)** con dos vistas web:

- **Researcher** (PC Windows / Chrome o Edge): panel de control de sesión y métricas EEG en vivo.
- **Participante / Quest 3** (`/participant` → `/wait?vr=1`): consentimiento → espera en VR → vídeo 360° controlado por el investigador.

EEG en producción: casco **AURA** vía **LSL** (stream `"AURA"`, 8 canales ~250 Hz). Mock incluido para pruebas sin casco.

## Arquitectura

```
Browser (Quest / Researcher)  ──wss──►  HTTPS server (Node, 8443)
                                                │
                                                ▼  ws://127.0.0.1:8765
                                       Recorder (Python AURA · LSL)
                                       o Mock (Node)
```

## Quick start (Windows 10/11)

1. **Instalar Node LTS** desde nodejs.org (con "Add to PATH").
2. En `cmd.exe` desde la carpeta del proyecto:
   ```cmd
   npm install
   ```
3. **Solo si vas a usar AURA real:** instalar Python 3.10+ ("Add to PATH") y:
   ```cmd
   npm run setup:python
   ```
4. Conéctate a la red Wi-Fi del laboratorio y genera el certificado (incluye la IP LAN actual):
   ```cmd
   npm run cert
   ```
5. Abre el puerto en el firewall (Administrador):
   ```cmd
   scripts\open-firewall-windows.cmd
   ```
6. Arrancar:
   - **Con AURA (producción):** enciende el casco y el software AURA (LSL `"AURA"` activo) y ejecuta `run-experiment.bat`.
   - **Sin casco (pruebas):** `run-experiment-mock.bat`.
7. Encuentra la IP LAN (`ipconfig` → adaptador Wi-Fi). Abre:
   - **Investigador:** `https://<IP-LAN>:8443/researcher`
   - **Quest 3 (participante):** `https://<IP-LAN>:8443/participant` → acepta consentimiento → entra en VR.

> En el Quest hay que aceptar la excepción del certificado autofirmado una vez por dispositivo.

## Flujo de sesión

1. El participante acepta consentimiento → llega a la pantalla VR "Esperando al investigador".
2. El investigador configura **fobia / nivel inicial / duración / calibración (s)** y pulsa **Start**.
3. El participante ve el vídeo 360° correspondiente.
4. El investigador puede pulsar **niveles 0–5** (cambio inmediato), o dejar que el índice EEG sugiera subir/bajar (`hybrid` con adaptación ON).
5. **Stop** detiene el vídeo y, con AURA, guarda un CSV en `output/`.

## Estructura

```
server/server.js          HTTPS 8443 + WS hub /ws + estáticos + API content
public/                   index, researcher, participant (consent), wait (VR + 360 sphere)
data/content.json         Mapeo fobia/nivel → MP4 en videos/
videos/                   30 vídeos 360° (5 fobias × 6 niveles) + baseline.mp4
scripts/aura_recorder.py  Recorder Python (LSL AURA + índice + CSV)
scripts/mock_recorder.js  Recorder mock (sin casco)
scripts/run-experiment.js Orquestador (recorder + HTTPS)
scripts/generate-cert.js  Cert autofirmado con SAN incluyendo IP LAN
scripts/test-ws.js        Smoke test del WS hub
run-experiment.bat        Atajo Windows (AURA)
run-experiment-mock.bat   Atajo Windows (mock)
output/                   CSVs de sesión
```

## Protocolo WebSocket (`wss://<host>:8443/ws`)

Ver sección 4 de [`ESPECIFICACION_PROYECTO_VR_FOBIA.md`](ESPECIFICACION_PROYECTO_VR_FOBIA.md). Resumen:

Cliente → servidor: `controller_start`, `manual_level`, `set_auto_adaptation`, `level_change`, `stop`.
Servidor → clientes: `recorder_ready`, `start_experiment`, `force_level`, `adaptive_state`, `auto_adaptation_toggle`, `stop_video`, `recorder_error`.

## Test rápido

Con el sistema corriendo:
```cmd
node scripts\test-ws.js
```
Debe imprimir `OK: participant got start_experiment …`.

## macOS/Linux (desarrollo)

Funciona, pero los `.bat` no aplican. Usa:
```bash
npm install
npm run setup:python   # opcional, si vas a probar el recorder
npm run cert
npm run experiment      # con AURA (LSL)
# o
npm run experiment:mock # sin casco
```

## Solución de problemas

| Síntoma | Acción |
|---|---|
| Quest no carga la URL | Misma Wi-Fi; firewall 8443; cert con IP LAN actual (`npm run cert`). |
| WS conectado pero sin vídeo | Asegúrate de que el recorder está vivo; UI debe ver `recorder_ready`. |
| Python: `pylsl` falta | `npm run setup:python` (necesita Python 3 + pip en PATH). |
| `Is AURA running?` | Encender AURA y software hasta ver el stream LSL `"AURA"` antes de iniciar. |
| Autoplay del vídeo bloqueado | Toca el overlay "Tocar para iniciar vídeo" en el Quest. |
# Phobias-ATR
