---
title: Llave de Voz
emoji: 🔑
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
---

# voice-key-assistant

Asistente de voz con "llave de voz": antes de procesar un comando verifica la
identidad del hablante mediante huella vocal (speaker embedding). Si la voz no
coincide con un perfil enrolado, ignora el comando o responde en modo invitado.

## Flujo

```
micrófono ─► VAD (frase) ─► embedding ─► verificación ─► rol (owner/family/guest)
                                              │                │
                                     adaptación del perfil     ├─ guest + "ignore" ─► descarta
                                                               ▼
                                      faster-whisper ─► Claude (prompt con rol) ─► TTS
```

La verificación ocurre **antes** de la transcripción: con `guest_mode: ignore`,
el audio de una voz desconocida no se transcribe ni se envía a la API.

## Módulos

| Módulo | Función |
|---|---|
| `audio/capture.py` | Captura con `sounddevice`, segmentación en frases con `webrtcvad` (`PhraseSegmenter` testeable sin micrófono). |
| `voice/embedding.py` | Embeddings `resemblyzer` (256-d), similitud coseno, persistencia de perfiles. |
| `voice/enroll.py` | Graba 5–10 muestras, promedia y guarda `profiles/<nombre>.npy` (+ `.anchor.npy`). |
| `voice/verify.py` | Identifica al hablante contra todos los perfiles (umbral 0.75) con adaptación por media móvil. |
| `voice/permissions.py` | Roles `owner` / `family` / `guest` desde `config.yaml`; asignaciones en `profiles/roles.yaml`. |
| `stt/transcribe.py` | `faster-whisper`, modelo `small`, español. |
| `llm/respond.py` | API de Anthropic con system prompt que incluye el nivel de permiso. Historial separado por hablante. |
| `tts/speak.py` | `edge-tts` (reproduce con `mpv` o `ffplay`); fallback a `pyttsx3`. |
| `server/app.py` | API HTTP (FastAPI) + app web para usar el asistente desde el teléfono. `server/audio_io.py` decodifica el audio del navegador (ffmpeg). |
| `web/` | PWA: graba, muestra el resultado de la verificación y reproduce la respuesta. |
| `audit.py` | Registro de cada intento (consola + JSONL) con el resultado de la verificación. |
| `main.py` | CLI `enroll` / `run`. Loop: capturar → verificar hablante → transcribir → responder → hablar. |

## Instalación

Requiere **Python 3.11 o superior** (`main.py` lo verifica al iniciar).

```bash
cd voice-key-assistant
python3.11 -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
export ANTHROPIC_API_KEY=...                            # Windows: set ANTHROPIC_API_KEY=...
```

Dependencias de sistema (pueden variar según SO; verificar en la documentación de cada paquete):
- PortAudio (para `sounddevice`), p. ej. `apt install libportaudio2`.
- Compilador C para `webrtcvad` (no siempre trae wheels precompilados).
- `mpv` o `ffmpeg` (`ffplay`) para reproducir el MP3 de `edge-tts`; si no hay ninguno se usa `pyttsx3`
  (en Linux requiere `espeak`/`espeak-ng`).

## Uso

```bash
python main.py enroll --name owner --role owner     # solo puede haber un dueño
python main.py enroll --name maria --role family
python main.py run
```

## Uso desde el iPhone (o cualquier navegador)

Si no tienes computador, el asistente puede correr en un servidor en la nube y usarse desde una
app web. Guía paso a paso con Hugging Face Spaces (gratuito): [`docs/DESPLIEGUE_IPHONE.md`](docs/DESPLIEGUE_IPHONE.md).
La cabecera YAML al inicio de este README es la configuración que Spaces necesita.

Para correr el servidor en local:

```bash
pip install -r requirements-server.txt      # requiere ffmpeg instalado
export ANTHROPIC_API_KEY=... VKA_TOKEN=un-secreto-largo
python -m uvicorn server.app:app --port 7860
# abrir http://localhost:7860 y pegar el token en Ajustes
```

Endpoints (todos con cabecera `X-Auth-Token`): `GET /api/status`, `POST /api/enroll`
(5–10 archivos de audio), `POST /api/command` (un audio → verificación, transcripción, respuesta
y MP3 en base64), `GET /api/profiles/export` y `POST /api/profiles/import` (respaldo de perfiles).

**No probado aún:** el build del `Dockerfile` (este entorno no tiene daemon de Docker) y la
grabación desde Safari en iOS; la API está cubierta por tests con componentes simulados.

## Registro de intentos

Cada frase detectada genera un registro, en consola y en `logs/attempts.jsonl` (una línea JSON por intento):

```json
{"outcome": "accepted", "speaker": "owner", "role": "owner", "score": 0.8731, "threshold": 0.75,
 "accepted": true, "adapted": true, "audio_seconds": 2.4, "scores": {"owner": 0.8731, "maria": 0.41},
 "transcript": "¿qué tengo mañana?", "response": "...", "error": null, "timestamp": "2026-10-31T17:20:00+00:00"}
```

Valores de `outcome`: `accepted`, `guest_answered`, `ignored`, `invalid_audio`, `empty_transcript`, `error`.
Con `logging.log_transcripts: false` no se guardan el texto ni las respuestas; solo los metadatos de verificación.
Los intentos rechazados (`ignored`) sirven para calibrar el umbral y para detectar intentos de suplantación.
Un error puntual (red, TTS) queda registrado y el loop continúa.

## Adaptación continua (y por qué es conservadora)

Tras una verificación exitosa: `perfil = normalizar((1-α)·perfil + α·muestra)`.
Para evitar que el perfil "derive" hacia otra voz:
- solo se adapta con puntaje ≥ `adaptation.min_score` (0.82, más estricto que el umbral 0.75);
- se rechaza la actualización si el perfil resultante queda con similitud < `max_drift` (0.85)
  respecto del perfil original de enrolamiento (`*.anchor.npy`).

## Limitaciones de seguridad (importante)

- **No hay detección de vida (liveness / anti-spoofing).** Una grabación o una voz clonada
  con IA del dueño podría pasar la verificación. No usar como único factor para acciones críticas
  (pagos, cerraduras, accesos).
- El umbral 0.75 es un punto de partida: la tasa real de falsos aceptados/rechazados depende del
  micrófono, ruido y hablantes. Conviene calibrarlo con grabaciones propias.
- Las restricciones por rol en el LLM se aplican vía system prompt; son una guía para el modelo,
  no un control duro. Las acciones reales (domótica, etc.) deben validarse con
  `Role.can(capability)` en código antes de ejecutarse.
- `profiles/` contiene datos biométricos y está excluido de git.

## Modelo LLM

`config.yaml` usa `claude-sonnet-4-5` según lo solicitado. Ese modelo está **deprecado y se
retira el 2026-11-30**; para seguir funcionando después de esa fecha, cambiar `llm.model`
(p. ej. `claude-sonnet-5-5`).

## Tests

```bash
pip install -r requirements-dev.txt
python -m pytest -q
```

Cubren segmentación VAD, construcción de perfil, verificación, adaptación/deriva, permisos, el loop
principal y la API HTTP (enrolamiento, comandos, respaldo, decodificación de audio), con embeddings
sintéticos y componentes simulados (no requieren micrófono, modelos ni API). Los tests de la API
necesitan `pip install fastapi httpx python-multipart`.
