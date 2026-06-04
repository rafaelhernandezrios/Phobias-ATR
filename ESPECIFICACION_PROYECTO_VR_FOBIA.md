# Especificación del proyecto — VR Phobia Exposure + EEG (rebuild from scratch)

**Versión:** 1.0 · **Propósito:** Documento único para que otra IA o equipo implemente el sistema desde cero.  
**Entrada mínima en carpeta nueva:** este archivo + carpeta de vídeos 360° (`.mp4`).

### Plataforma de despliegue (importante)

**El sistema se usará principalmente en Windows 10/11 (64-bit).**

- El **PC servidor** del laboratorio (HTTPS + bridge WebSocket + recorder/mock) será **Windows**.
- El **investigador** controlará la sesión desde **Windows** (Chrome o Edge).
- El **participante** seguirá en **Meta Quest** (mismo Wi‑Fi); eso no cambia, pero todo el backend y la documentación de instalación deben priorizar **Windows** (scripts `.bat`, firewall, rutas, Node/Python en PATH).
- macOS/Linux pueden ser secundarios (desarrollo opcional), pero **no** son el objetivo principal de entrega.

### EEG con casco AURA (importante — uso previsto en producción)

**El laboratorio usará el casco EEG AURA en sesiones reales**, no solo modo simulado.

- El software del casco debe publicar un stream **LSL (Lab Streaming Layer)** con nombre **`AURA`** (8 canales, ~250 Hz).
- Un proceso **recorder** en el PC Windows lee ese stream, calcula un **índice miedo/compromiso** en tiempo real y lo envía al panel del investigador y (opcionalmente) adapta el nivel de exposición en el Quest.
- El modo **mock** (EEG sintético sin casco) sirve solo para **pruebas sin hardware**; el diseño y la documentación deben tratar **AURA + LSL como el camino principal**.

---

## English summary (for implementers)

Build a **lab VR phobia exposure platform** with **two browser UIs** on the same HTTPS server:

1. **Participant (Meta Quest / browser):** consent → **VR wait for researcher** → immersive **360° video** whose level changes when the researcher commands it (or optionally from EEG).
2. **Researcher (PC browser):** configure session (phobia, level 0–5, duration, experiment ID) → **Start/Stop** → live metrics → **manual levels 0–5**.

All real-time control goes through a **WebSocket hub** (recorder/bridge) that broadcasts `start_experiment`, `force_level`, `adaptive_state`, `stop_video` to every connected client. The participant must **not** choose phobia/level in the default lab flow.

**EEG (required for real lab sessions):** **AURA** headset → **LSL** stream `"AURA"` → Python recorder → WebSocket `adaptive_state` + CSV in `output/`. Mock mode only for testing without the headset.

**Hard requirements:** HTTPS for Quest; same LAN; self-signed or proper TLS; 5 phobias × (baseline + levels 1–5) as separate MP4 files; emergency exit always available.

**Deployment target:** **Windows 10/11** lab PC as server + researcher machine. Provide Windows-first install/run scripts (`.bat`), firewall rules, and troubleshooting. Quest remains the participant device.

---

## 1. Visión y objetivos

### 1.1 Qué se quiere lograr

Plataforma web para **exposición gradual a fobias en realidad virtual (360°)** en contexto de **investigación clínica o experimental**, con:

- **Participante** en visor VR (Meta Quest) o navegador: ve vídeos inmersivos; en el flujo de laboratorio **no configura** la sesión; solo acepta consentimiento y espera.
- **Investigador** en PC: controla inicio, parada, fobia, nivel inicial, duración, niveles manuales, **calibración baseline EEG** y adaptación automática ON/OFF.
- **EEG AURA:** registro continuo de la señal y **índice adaptativo** que informa subir/bajar/mantener nivel (con reglas de histéresis en el cliente VR).
- **Sincronización en tiempo real** entre investigador, participante y recorder vía WebSocket.
- **Seguridad:** consentimiento informado, botón de salida de emergencia, posibilidad de bajar nivel de inmediato.
- **Registro:** CSV en `output/` con timestamps, canales EEG y etiquetas de fobia/nivel por sesión.

### 1.2 Qué NO es el flujo principal (pero puede existir como extra)

- Menú donde el participante elige fobia y nivel solo (modo demo / autoguiado).
- App de escritorio obligatoria (Electron, etc.) para el investigador — **preferir panel web**.
- Un solo puerto confuso para el usuario final: el participante solo debe abrir HTTPS; el WebSocket del recorder puede ir por proxy en el mismo origen (`wss://host/ws`).

### 1.3 Usuarios y dispositivos

| Rol | Dispositivo típico | Restricciones |
|-----|-------------------|---------------|
| Participante | Meta Quest (navegador integrado), opcionalmente PC con VR | HTTPS obligatorio; misma red Wi‑Fi que el servidor Windows |
| Investigador | **PC Windows 10/11**, Chrome o Edge | Misma URL base que el Quest (`https://<IP-PC-Windows>:8443/...`) |
| Servidor | **PC Windows del laboratorio** (misma máquina que el investigador o dedicada) | Node.js (o runtime elegido) + firewall; sin depender de Electron |

**Implicaciones Windows para quien implemente:**

- Launchers doble clic: `run-experiment.bat`, `run-experiment-mock.bat`.
- Abrir puerto **8443** en Firewall de Windows (regla entrante TCP, red privada).
- Certificado TLS: regenerar al cambiar de red Wi‑Fi; detectar IPv4 con `ipconfig` (no asumir solo herramientas Unix).
- Evitar dependencias que fallen en Windows (p. ej. Electron obligatorio, Bash-only, `ELECTRON_RUN_AS_NODE` en IDEs).
- Python (si hay EEG): instalador oficial, “Add to PATH”, venv en `.venv\Scripts\python.exe`.
- Probar flujo completo en **Windows + Quest en LAN** antes de dar por terminado.

---

## 2. Las dos vistas (obligatorias)

### 2.1 Vista PARTICIPANTE (usuario / Quest)

**Objetivo:** Experiencia inmersiva mínima y clara: esperar → ver vídeo 360° → cambiar de vídeo cuando el investigador lo indique.

#### Pantallas / estados

| Estado | Qué ve el participante | Qué NO debe ver |
|--------|------------------------|-----------------|
| **A. Consentimiento** | Texto legal breve + botón Aceptar / Rechazar | Menú de fobias, selector de nivel, “modo EEG” |
| **B. Espera (VR)** | Mensaje en VR: “Esperando al investigador” + indicador de conexión | Panel 2D grande encima del VR; formularios de configuración |
| **C. Exposición** | Esfera 360° con vídeo; HUD discreto (nivel, fobia, tiempo, índice miedo si hay EEG); **EMERGENCY EXIT** | Pantalla de “configuración”; elegir fobia |

#### Flujo obligatorio (laboratorio)

```
Consentimiento (A) → Espera VR (B) → [investigador pulsa Start] → Exposición (C)
```

- En (B) el participante **permanece** hasta recibir evento WebSocket `start_experiment`.
- En (C) el vídeo corresponde a **fobia + nivel** enviados por el investigador.
- Si el investigador envía **nivel manual** (`force_level`), el participante **cambia de vídeo** sin recargar la página (mismo estado C, nuevo `src` del vídeo).
- **Stop** o `stop_video`: volver a (B) o pantalla de fin según diseño; al menos detener vídeo y mostrar espera.

#### Requisitos VR (Quest)

- Entrada automática en VR tras consentimiento (opcional `?vr=1`).
- Vídeo en `<video>` oculto + textura en esfera 360° (A-Frame, Three.js, o equivalente).
- Autoplay: políticas del navegador → overlay “Tocar para iniciar vídeo” si falla `play()`.
- Un solo origen HTTPS: `https://<IP-SERVIDOR>:8443/...`

#### URL sugerida (participante)

`https://<IP-LAN>/participant` o `.../wait` — implementador elige rutas; deben ser estables y documentadas.

---

### 2.2 Vista INVESTIGADOR (researcher / PC)

**Objetivo:** Panel de control de sesión + métricas en vivo; **no** es experiencia VR.

#### Secciones de la UI

| Sección | Controles | Comportamiento |
|---------|-----------|----------------|
| **Sesión** | Fobia (lista desde datos), nivel inicial 0–5, ID experimento, duración (s), tipo sesión, calibración baseline (s) | Al **Start** envía `controller_start` por WebSocket |
| **Control** | Start experiment, Stop, Adaptación ON/OFF | Stop → `stop` + participante deja de ver vídeo |
| **Niveles manuales** | Botones 0, 1, 2, 3, 4, 5 | Cada uno envía `manual_level` → todos los clientes reciben `force_level` |
| **Métricas EEG (AURA)** | Índice miedo/compromiso, sugerencia `up`/`hold`/`down`, θ Fz, β/α, α posterior, FAA, fase calibración | Actualización ~cada 2 s vía `adaptive_state` desde recorder |
| **Calibración** | Campo `baseline_calibration_seconds` (ej. 45 s) en Start | Durante calibración: solo recoger baseline; luego adaptación activa |

#### Lo que el investigador NO necesita

- Ver el vídeo 360° a pantalla completa (opcional preview).
- Instalar Electron obligatoriamente.
- Configurar Python en la máquina del investigador si el servidor ya integra el bridge.

#### URL sugerida

`https://<IP-LAN>/researcher` — solo accesible en red local del laboratorio.

---

## 3. Arquitectura lógica (recomendada para rebuild)

La IA puede elegir stack (Node, Python, Go, etc.), pero la **arquitectura funcional** debe ser equivalente a:

```
┌─────────────────────┐     wss://servidor/ws      ┌──────────────────────────┐
│  Navegador          │ ◄────────────────────────► │  Servidor HTTPS          │
│  Participante       │      (mismo origen)        │  · Estáticos (HTML/JS)   │
└─────────────────────┘                            │  · Proxy WS → recorder   │
┌─────────────────────┐                            └───────────┬──────────────┘
│  Navegador          │                                        │
│  Investigador       │ ◄──────────────────────────────────────┘
└─────────────────────┘                                        │
                                                               ▼
                                                   ┌──────────────────────────┐
                                                   │  Recorder / Bridge       │
                                                   │  · WebSocket :8765       │
                                                   │  · Broadcast a todos     │
                                                   │  · Inlet LSL ← AURA      │
                                                   │  · CSV en output/        │
                                                   └─────────────┬────────────┘
                                                                 │ LSL (~250 Hz, 8 ch)
                                                                 ▼
                                                   ┌──────────────────────────┐
                                                   │  Casco AURA + software   │
                                                   │  (stream name: "AURA")   │
                                                   └──────────────────────────┘
```

**Reglas críticas:**

1. **`controller_start`** (desde investigador) → el bridge **re-emite** `start_experiment` a **todos** los clientes WebSocket conectados (incluido participante).
2. Cliente nuevo que se conecta **durante** sesión activa debe recibir **estado actual** (re-envío de `start_experiment` + `force_level` con nivel actual).
3. “Connected” en UI del participante solo es válido si el bridge/recorder responde (mensaje tipo `recorder_ready` o primer `adaptive_state` / `start_experiment`).
4. Modo **AURA (producción):** el recorder debe leer LSL stream **`"AURA"`**; si no existe, error claro — no simular EEG real.
5. Modo **mock** (respaldo): `adaptive_state` sintético; solo pruebas sin casco.

---

## 4. Protocolo WebSocket (contrato entre componentes)

Puerto interno típico del recorder: **8765** (ws o wss en loopback).  
Navegadores en HTTPS: **`wss://<host>/ws`** proxied al recorder.

### 4.1 Cliente → servidor (investigador o participante)

| `type` | Quién lo envía | Campos principales | Efecto |
|--------|----------------|-------------------|--------|
| `controller_start` | Investigador | `phobia_id`, `phobia_name`, `level` (0–5), `experiment_id`, `duration_seconds`, `session_type` (`hybrid` \| `auto_sequence`), `baseline_calibration_seconds` | Inicia sesión; **broadcast** `start_experiment` |
| `manual_level` | Investigador | `level` (0–5) | **Broadcast** `force_level` |
| `set_auto_adaptation` | Investigador | `enabled` (bool) | **Broadcast** `auto_adaptation_toggle` |
| `level_change` | Participante (adaptativo) | `level` | Sincroniza nivel en recorder |
| `stop` | Investigador | — | Guarda CSV (si aplica), **broadcast** `stop_video`, detiene grabación |
| `stop_video` | Investigador | — | Solo UI: parar vídeo en participante |

### 4.2 Servidor → clientes (broadcast salvo ack)

| `type` / campo | Contenido | Efecto en participante |
|----------------|-----------|------------------------|
| `start_experiment` | `phobia_id`, `level`, `experiment_id`, `duration_seconds`, `session_type`, … | Ocultar espera; cargar y reproducir vídeo del nivel |
| `force_level` | `level` (0–5) | Cambiar vídeo al nivel indicado |
| `adaptive_state` | `fear_index`, `level_suggestion` (`up`/`down`/`hold`), `current_level`, `metrics`, fases calibración | HUD; si adaptación ON y `hybrid`, puede cambiar nivel con reglas de histéresis |
| `auto_adaptation_toggle` | `enabled` | Activar/desactivar aplicación de sugerencias |
| `stop_video` | — | Pausar vídeo; volver a espera |
| `recorder_ready` | (opcional, proxy) | UI: conexión real al bridge OK |
| `recorder_error` | `message` | UI: error claro (“iniciar servidor con mock”) |
| `status: "started"` | ack al emisor de start | Confirmación en panel investigador |

### 4.3 Tipos de sesión

| `session_type` | Comportamiento |
|----------------|----------------|
| `hybrid` | Nivel inicial del investigador; luego sugerencias EEG (si ON) + niveles manuales |
| `auto_sequence` | Tras start en nivel 0, subir automáticamente 0→1→2→3→4→5 repartiendo `duration_seconds` en segmentos iguales |

---

## 5. Contenido: fobias, niveles y vídeos

### 5.1 Modelo de datos (`content.json`)

Archivo JSON en el servidor (ej. `data/content.json`):

```json
{
  "baseline": {
    "id": "baseline",
    "name": "Escena neutral",
    "video_url_360": "videos/baseline.mp4",
    "duration_seconds": 60
  },
  "phobias": [
    {
      "id": "arachnophobia",
      "name": "Arachnophobia",
      "name_es": "Aracnofobia",
      "baseline": {
        "video_url_360": "videos/arachnophobia_baseline.mp4",
        "duration_seconds": 60
      },
      "levels": [
        { "level_number": 1, "video_url_360": "videos/arachnophobia_level1.mp4", "duration_seconds": 90 },
        { "level_number": 2, "video_url_360": "videos/arachnophobia_level2.mp4", "duration_seconds": 90 }
      ]
    }
  ]
}
```

- **5 fobias:** `arachnophobia`, `claustrophobia`, `acrophobia`, `ophidiophobia`, `entomophobia`.
- **Nivel 0:** vídeo `baseline` por fobia (o escena neutral global).
- **Niveles 1–5:** intensidad creciente (un MP4 por nivel).

### 5.2 Convención de nombres de archivos (carpeta que entregarás)

Por fobia `{id}`:

| Archivo | Nivel |
|---------|-------|
| `{id}_baseline.mp4` | 0 |
| `{id}_level1.mp4` | 1 |
| `{id}_level2.mp4` | 2 |
| `{id}_level3.mp4` | 3 |
| `{id}_level4.mp4` | 4 |
| `{id}_level5.mp4` | 5 |

Opcional: `baseline.mp4` (neutral global).

**Total esperado:** 5 × 6 = 30 vídeos por fobia set completo + 1 neutral ≈ **31 archivos MP4**.

Formato: **equirectangular 360°**, codec H.264 recomendado para Quest.

### 5.3 Resolución de URL en cliente

Dado `phobia_id` y `level`, el cliente busca en `content.json` la ruta relativa y la sirve desde el mismo host HTTPS (ej. `https://IP/videos/arachnophobia_level1.mp4`).

---

## 6. EEG con casco AURA (modo principal del laboratorio)

### 6.1 Objetivo

En cada sesión con participante real, el PC Windows debe:

1. Recibir EEG del **AURA** vía **LSL**.
2. Mostrar métricas en vivo al **investigador**.
3. Opcionalmente **adaptar el nivel** del vídeo 360° en el Quest según el índice (modo `hybrid`), o dejar solo control manual del investigador.
4. Guardar **CSV** al finalizar (`stop`) para análisis offline.

El modo mock **no sustituye** al AURA en producción; es solo para pruebas de red/VR sin poner el casco.

### 6.2 Hardware y software AURA

| Elemento | Especificación |
|----------|----------------|
| Dispositivo | Casco / banda **AURA** (EEG de investigación) |
| Conexión al PC | USB o según fabricante; drivers/software AURA instalados en **Windows** |
| Salida hacia el proyecto | Stream **LSL** con **nombre de stream: `AURA`** |
| Canales | **8** (mapeo orientativo 10–20) |
| Frecuencia | ~**250 Hz** (tolerar variación si el driver es estable) |

**Mapeo de canales AURA (ch1–ch8) → posiciones 10–20:**

| Canal AURA | Electrodo | Uso en el índice |
|------------|-----------|------------------|
| ch1 | F3 | FAA (asimetría alpha frontal) |
| ch2 | F4 | FAA |
| ch3 | Fz | Theta frontal, β/α |
| ch4 | Cz | β/α (apoyo) |
| ch5 | Pz | Supresión alpha posterior / carga visual VR |
| ch6 | P3 | Alpha posterior |
| ch7 | P4 | Alpha posterior |
| ch8 | Oz | Alpha posterior / atención visual |

Si el dispositivo entrega **menos de 8 canales**, el recorder debe degradar con gracia (p. ej. usar canales frontales disponibles) y **registrar en log** qué montaje se detectó.

### 6.3 Índice miedo / compromiso (Fear/Engagement)

Índice compuesto en z-score respecto al baseline de la sesión (implementación de referencia en `eeg_adaptive.py`):

```
Fear/Engagement = w1·z(θ_Fz) + w2·z(β/α)_Fz,Cz + w3·z(AlphaSuppression) + w4·z(FAA)
```

- **θ Fz:** potencia theta (4–8 Hz) en Fz — vigilancia / ansiedad.
- **β/α Fz,Cz:** ratio beta/alpha — activación.
- **Supresión alpha posterior:** menos alpha en Pz,P3,P4,Oz → más compromiso visual.
- **FAA:** (F4−F3)/(F4+F3) en banda alpha — modulador afectivo.

Pesos por defecto: 0.25 cada uno. El investigador ve el valor en tiempo real; el participante puede verlo en el HUD (opcional).

### 6.4 Calibración y adaptación de nivel

| Parámetro (en `controller_start`) | Efecto |
|-----------------------------------|--------|
| `baseline_calibration_seconds` (ej. **45**) | Ventana inicial: solo recoger baseline EEG; `level_suggestion` = hold; UI muestra fase `calibration` |
| `0` | Modo legacy: baseline con primeras N muestras |
| `session_type: hybrid` | Tras calibración: sugerencias `up`/`down` + niveles manuales del investigador |
| `session_type: auto_sequence` | Rampa temporal 0→5 por vídeo (menos dependiente del EEG) |
| Adaptación ON/OFF (`set_auto_adaptation`) | Participante aplica o ignora `level_suggestion` |

**Reglas típicas (resumen):**

- **Subir nivel:** índice agregado por debajo del umbral de estrés (calma), con histéresis/cooldown en el cliente (~8 s entre cambios automáticos).
- **Bajar nivel:** índice por encima del umbral sostenido durante **dwell** (ej. 8 s).
- **Investigador siempre puede** forzar nivel 0–5 con `manual_level` → `force_level` inmediato en el Quest.

Payload `adaptive_state` (cada ~2 s) debe incluir al menos: `fear_index`, `level_suggestion`, `current_level`, `metrics` (theta_fz, beta_alpha_fz_cz, alpha_posterior, faa), `adaptive_phase`, `baseline_remaining_s` (si aplica).

### 6.5 Recorder (bridge Python en Windows)

Proceso separado o integrado; responsabilidades:

1. `resolve_byprop("name", "AURA")` — si no hay stream: error claro *"Is AURA running?"*.
2. Bucle de lectura LSL → buffer circular (numpy).
3. WebSocket servidor en **8765** (ws o wss en loopback; el HTTPS hace proxy `wss://host/ws`).
4. Handlers de mensajes según sección 4.
5. Al `stop`: **guardar CSV** en `output/` con `experiment_id`, timestamps, niveles, canales.

**Dependencias Python (Windows):** `pylsl`, `websockets`, `numpy`, `scipy` (venv recomendado).

### 6.6 Arranque en Windows con AURA (checklist)

Orden recomendado para el laboratorio:

```
1. Encender AURA y abrir su software en Windows hasta que el stream LSL "AURA" esté activo
2. Verificar LSL (opcional): LabRecorder o script que liste streams con nombre AURA
3. En el PC: npm install, npm run setup:python (venv + dependencias)
4. npm run cert  (en la red Wi‑Fi del lab)
5. scripts\open-firewall-windows.cmd  (Administrador)
6. run-experiment.bat  (o: npm run experiment)
   → levanta HTTPS :8443 + aura_recorder.py (NO solo mock)
7. Quest: https://<IP>/disclaimer-participant.html
8. PC investigador: https://<IP>/researcher.html
9. Investigador: baseline_calibration_seconds, fobia, nivel → Start
```

**Comando de referencia (implementación actual del repo origen):**

- Full EEG: `npm run experiment` → HTTPS + `python scripts/aura_recorder.py --wss` (o ws en loopback con proxy).
- Solo prueba sin casco: `npm run experiment:mock`.

### 6.7 Salidas de datos (AURA)

| Salida | Ubicación | Contenido |
|--------|-----------|-----------|
| CSV sesión | `output/*.csv` | EEG multicanal, timestamps LSL, etiquetas phobia_id / level |
| WebSocket | `adaptive_state` | Índice y métricas para UI en vivo |
| LSL opcional | `VRPhobia_State`, inlet `VRPhobia_ManualLevel` | Integración con LabRecorder u otras herramientas (--lsl) |

### 6.8 Modo mock (sin AURA — solo desarrollo)

- Mismo protocolo WebSocket (`start_experiment`, `force_level`, `adaptive_state` sintético).
- **No requiere** pylsl ni casco encendido.
- Usar cuando: probar Quest/firewall/URLs sin molestar al participante con EEG.
- Debe existir un comando distinto (`experiment:mock` / `.bat` mock) para no confundir con sesión real AURA.

### 6.9 Criterios de aceptación específicos AURA

- [ ] Con AURA encendido y LSL activo, el recorder conecta y el panel investigador muestra métricas que **cambian** cada ~2 s.
- [ ] Sin stream LSL, el sistema **no** indica sesión EEG válida (mensaje de error accionable).
- [ ] Tras `controller_start` con calibración 45 s, fase `calibration` visible en payload; luego `adaptation`.
- [ ] `manual_level` cambia vídeo en Quest aunque la adaptación automática esté OFF.
- [ ] `stop` genera archivo CSV en `output/`.
- [ ] Sesión completa probada en **Windows 10/11 + Quest + AURA** en la misma LAN.

---

## 7. Red, HTTPS y despliegue (Windows)

### 7.0 Entorno objetivo

| Componente | SO |
|------------|-----|
| Servidor HTTPS + WebSocket | **Windows 10/11** |
| Panel investigador | **Windows** (navegador) |
| Participante VR | Meta Quest (Android-based browser) |
| Desarrollo secundario | macOS/Linux opcional |

### 7.1 Requisitos de red

- PC servidor y Quest en **la misma subred Wi‑Fi** (no red invitados aislada).
- **Firewall de Windows** en el PC servidor: permitir **TCP entrante 8443** (perfil red privada). Incluir script `open-firewall-windows.cmd` ejecutable como Administrador.
- En Quest usar **`https://<IP-PC-Windows>:8443/...`** — nunca `127.0.0.1`.
- Obtener IP LAN en Windows: `ipconfig` → adaptador Wi‑Fi/Ethernet activo (ej. `192.168.x.x`).

### 7.2 Certificados TLS

- Autofirmado aceptable en laboratorio.
- El certificado debe incluir en SAN: `localhost`, `127.0.0.1`, **y la IPv4 LAN actual del PC** (regenerar cert al cambiar de red).
- Quest: el usuario acepta excepción de seguridad **una vez** por dispositivo.

### 7.3 Comandos objetivo en Windows (referencia; la IA puede renombrar)

| Acción | Comportamiento esperado en Windows |
|--------|-----------------------------------|
| Instalar deps | `npm install` en cmd.exe; Node LTS desde nodejs.org |
| Generar cert | Tras conectar Wi‑Fi del lab (`npm run cert`) |
| Abrir firewall | Script `.cmd` como Administrador (puerto 8443) |
| Arrancar sesión **con AURA** | `run-experiment.bat` → HTTPS + recorder Python leyendo LSL `"AURA"` (casco encendido **antes**) |
| Arrancar demo sin casco | `run-experiment-mock.bat` → HTTPS + mock (solo pruebas VR/red) |
| Mostrar URLs LAN | Imprimir IP del PC Windows para Quest e investigador |

Usar **cmd.exe** o PowerShell para instrucciones de laboratorio; documentar si algún paso no funciona desde terminal integrada de Cursor (variables de entorno raras).

---

## 8. Seguridad y ética

- Consentimiento informado antes de exposición (texto editable).
- Advertencia de contenido fóbico (arañas, espacios cerrados, alturas, serpientes, insectos).
- **EMERGENCY EXIT** siempre visible durante exposición: detiene vídeo y notifica fin al bridge.
- Investigador puede bajar nivel en cualquier momento (botones 0–5).
- Datos EEG anonimizables vía `experiment_id` elegido por investigador.

---

## 9. Criterios de aceptación (definición de “terminado”)

### Participante

- [ ] Tras aceptar consentimiento, solo ve espera en VR (sin menús extra).
- [ ] Con investigador en Start, reproduce vídeo 360° correcto para fobia/nivel.
- [ ] Al pulsar nivel manual en investigador, cambia vídeo en &lt; 2 s.
- [ ] Emergency exit detiene sesión de forma predecible.
- [ ] Funciona en Quest en LAN con IP del servidor.

### Investigador

- [ ] Panel web carga lista de fobias desde JSON.
- [ ] Start envía sesión; participante reacciona sin recargar página.
- [ ] Con **AURA + LSL** activos: métricas EEG en vivo (`adaptive_state`) en panel investigador.
- [ ] Stop detiene participante, grabación y escribe CSV en `output/`.

### Sistema

- [ ] Dos clientes WebSocket simultáneos (investigador + participante) reciben los mismos broadcasts.
- [ ] Reconexión del participante durante sesión restaura estado (snapshot).
- [ ] Prueba automatizable: enviar `controller_start` y recibir `start_experiment`.

---

## 10. Modo demo opcional (fuera del flujo lab)

Si se desea menú autoguiado para pruebas sin investigador:

- Pantalla menú → elegir fobia → nivel 1–3 o 1–5 → reproductor 360°.
- **No reemplaza** el flujo lab de dos vistas.

---

## 11. Entregables esperados de la IA que reimplemente

1. Repositorio con README de arranque **priorizando Windows 10/11** (`.bat`, firewall, cert, Quest en LAN); macOS opcional.
2. Servidor HTTPS + proxy WebSocket + **recorder AURA (LSL `"AURA"`)** + modo mock alternativo.
3. **Dos páginas web:** participante (consent + wait + player) e investigador (panel).
4. `content.json` de ejemplo apuntando a carpeta `videos/`.
5. Script o doc para generar cert con IP LAN.
6. Script firewall Windows (opcional).
7. Prueba mínima `test:ws` o equivalente.

---

## 12. Lecciones del intento anterior (evitar repetir errores)

| Problema observado | Solución requerida en rebuild |
|------------------|-------------------------------|
| WebSocket “Connected” pero sin vídeo | No marcar conectado hasta `recorder_ready`; distinguir mock vs AURA |
| Python sin pylsl / LSL no encontrado | `setup:python` en Windows; encender software AURA antes del recorder |
| Recorder sin `--wss` detrás de HTTPS | Proxy `wss://host/ws` → `ws://127.0.0.1:8765` en loopback |
| Proxy WSS → WS mal configurado | Un solo TLS en 8443; loopback recorder en `ws://127.0.0.1:8765` |
| Pantalla 2D tapando VR en Quest | Modo participante: ocultar overlays 2D; solo texto VR en espera |
| Quest no carga por IP | Cert con SAN = IP LAN; firewall 8443; misma Wi‑Fi |
| Electron en Windows fallaba | Panel investigador **solo web** |
| Participante ve menú EEG/disclaimer largo | Flujo corto: consent → wait → vídeo |

---

## 13. Prompt sugerido para pegar a la otra IA

```
Lee ESPECIFICACION_PROYECTO_VR_FOBIA.md en este repositorio.
Carpeta videos/ contiene MP4 360° con nombres {phobia}_baseline.mp4 y {phobia}_level{N}.mp4.

Entorno de producción: Windows 10/11 (PC servidor + investigador). Quest en la misma Wi‑Fi.

Implementa desde cero:
- Servidor HTTPS (puerto 8443) sirviendo dos UIs web: /researcher y flujo /participant (consent → VR wait → 360 player).
- WebSocket hub con broadcast; mensajes según sección 4 del documento.
- **Recorder Python con inlet LSL stream "AURA" (8 ch, ~250 Hz)** — índice adaptativo + CSV; esto es el modo de producción.
- Modo mock sin AURA solo para pruebas.
- content.json mapeando fobias y niveles a los MP4.
- LAN: cert autofirmado con IP local (ipconfig en Windows), instrucciones Quest + firewall Windows 8443.
- Scripts de arranque Windows (.bat) y guía paso a paso para laboratorio sin Bash.

Prioridad: flujo laboratorio (investigador controla, participante solo ve vídeos).
Elige el stack que consideres más robusto en Windows (Node, Python, etc.) pero cumple los criterios de aceptación sección 9.
Prueba obligatoria: PC Windows + Quest en LAN + sesión con AURA real (LSL visible) y CSV generado al Stop.
```

---

## 14. Glosario

| Término | Significado |
|---------|-------------|
| **Nivel 0** | Baseline / escena neutra o poco ansiógena |
| **Niveles 1–5** | Exposición gradual creciente |
| **Bridge / recorder** | Proceso que concentra WebSocket y EEG |
| **force_level** | Cambio de nivel inmediato a todos los clientes |
| **start_experiment** | Señal para que el participante empiece a reproducir |
| **AURA** | Casco EEG; publica LSL `"AURA"` |
| **LSL** | Lab Streaming Layer; puente entre AURA y el recorder |
| **adaptive_state** | Mensaje WS con índice EEG y sugerencia de nivel |
| **Fear/Engagement** | Índice compuesto derivado de bandas y FAA |

---

*Documento generado para rebuild independiente. Los vídeos son el activo principal; el código puede reescribirse por completo si se respeta este contrato de comportamiento y mensajes WebSocket.*
