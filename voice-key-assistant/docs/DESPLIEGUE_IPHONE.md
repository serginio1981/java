# Usar el asistente desde el iPhone (sin computador)

Esta guía despliega el servidor en **Hugging Face Spaces** (plan gratuito, sin tarjeta) y
usa la app web incluida (PWA) desde Safari. Todo se hace desde el navegador del iPhone.

> Advertencia honesta: estos pasos describen el flujo de Hugging Face tal como lo conozco.
> La interfaz y los límites del plan gratuito cambian con frecuencia; si algo no coincide,
> busca la opción equivalente en pantalla. Verifica el plan gratuito en https://huggingface.co/pricing

## Qué necesitas

- Una cuenta en https://huggingface.co (gratis).
- Una API key de Anthropic (https://console.anthropic.com → API Keys). El uso se cobra por consumo.
- Un token secreto inventado por ti para proteger tu asistente (por ejemplo, una frase larga).
  Quien tenga ese token puede usar el asistente y descargar tus perfiles de voz.

## 1. Crear el Space

1. Entra a https://huggingface.co/new-space
2. Nombre: `voice-key-assistant` (o el que quieras).
3. **SDK: Docker** → plantilla "Blank".
4. **Visibility: Private**. Imprescindible: por aquí pasan tu voz y tus respuestas.
5. Hardware: el gratuito (CPU basic). Crear.

## 2. Subir el código

Opción A (recomendada, desde el iPhone): en el Space, pestaña **Files** → **Add file** →
**Upload files**. Sube el contenido de la carpeta `voice-key-assistant/` de este repositorio
(puedes descargar el ZIP del repo desde GitHub con el botón "Code → Download ZIP" y descomprimirlo en la app Archivos).
Debe quedar `Dockerfile` y `README.md` en la raíz del Space.

Opción B: desde un computador, con git:
```bash
git clone https://huggingface.co/spaces/<tu-usuario>/voice-key-assistant
cp -r voice-key-assistant/* voice-key-assistant/.dockerignore voice-key-assistant/
cd voice-key-assistant && git add . && git commit -m "deploy" && git push
```

El `README.md` lleva al inicio la cabecera que Spaces necesita (`sdk: docker`, `app_port: 7860`).

## 3. Configurar los secretos

En el Space: **Settings → Variables and secrets** → **New secret**:

| Nombre | Valor |
|---|---|
| `ANTHROPIC_API_KEY` | tu API key de Anthropic |
| `VKA_TOKEN` | tu token secreto inventado |

Opcional, como *variables* (no secretas):

| Nombre | Valor | Para qué |
|---|---|---|
| `VKA_PRELOAD` | `0` | arrancar más rápido y cargar los modelos en la primera petición |

Guarda y el Space se reconstruye solo. La primera construcción puede tardar **10–20 minutos**
(instala PyTorch). En **Logs** debe terminar con `Uvicorn running on http://0.0.0.0:7860`.

## 4. Abrir la app en el iPhone

1. En el Space, abre la app en su propia pestaña: menú **⋯ → Embed this Space** y copia la
   **Direct URL** (algo como `https://<usuario>-voice-key-assistant.hf.space`). Esa URL es la
   que usarás; la página del Space con marcos no permite micrófono.
2. Abre la Direct URL en **Safari**. Si el Space es privado, Hugging Face te pedirá iniciar sesión.
3. Ve a **Ajustes** dentro de la app, pega tu `VKA_TOKEN` y guarda.
4. Para tenerla como app: botón **Compartir → Añadir a pantalla de inicio**.
   - Si al abrirla desde el icono no pide permiso de micrófono, úsala desde Safari: no todas
     las versiones de iOS permiten micrófono en apps web instaladas (no lo puedo garantizar).

## 5. Enrolar tu voz

Pestaña **Enrolar** → nombre `owner`, rol Dueño → **Comenzar**. Lee las 7 frases, una por
grabación, en un lugar silencioso. Al enviar, verás la "consistencia por muestra": valores
parecidos entre sí (por ejemplo 0.85–0.95) indican buen enrolamiento; si uno destaca por
debajo, repite.

Tras enrolar, la app guarda **una copia de tus perfiles en el teléfono** (localStorage).
Importante porque el disco del Space gratuito **se borra al reiniciar** (o al dormirse tras un
tiempo sin uso): cuando la app detecta que el servidor no tiene perfiles, los restaura sola.
Si borras datos de Safari pierdes esa copia; puedes volver a enrolar.

## 6. Usar

Pestaña **Hablar** → toca, habla, toca de nuevo. Verás si tu voz fue reconocida, la similitud,
la transcripción y la respuesta, que además se reproduce en voz.

Para probar la "llave": pide a otra persona que hable. Debe salir "Voz no reconocida".
Si no es así, sube `voice.threshold` en `config.yaml` (y vuelve a subir el archivo).
Si a ti te rechaza con frecuencia, bájalo un poco (0.70).

## Problemas frecuentes

| Síntoma | Causa probable |
|---|---|
| "Token inválido" | El token en Ajustes no coincide con `VKA_TOKEN` del Space. |
| Tarda 1–2 minutos la primera vez | El Space estaba dormido o cargando modelos. Normal en el plan gratuito. |
| "Este navegador no permite usar el micrófono" | Estás en la página del Space con marcos o en una app sin micrófono. Usa la Direct URL en Safari. |
| Respuesta en texto pero sin voz | Falló `edge-tts` en el servidor; la app usa la voz del iPhone como respaldo. |
| El build falla en `webrtcvad` o `resemblyzer` | Dependencia nativa que no compiló. Copia el error de **Logs** para corregir el `Dockerfile`. |
| Perdió los perfiles | Reinicio del Space; abre la app y restaurará la copia local (o Ajustes → Restaurar). |

## Costos y privacidad

- Hugging Face gratuito: sin costo; el Space se duerme tras inactividad y despierta al usarlo.
- Anthropic: por consumo. Cada comando son unos cientos de tokens; con uso personal el costo
  mensual es bajo, pero revisa la consola de Anthropic.
- Tu voz se procesa en los servidores de Hugging Face; la transcripción va a Anthropic; el audio
  de respuesta lo genera el servicio de Microsoft (edge-tts). Nada se almacena fuera del Space
  salvo los logs que decidas guardar (`logging.log_transcripts: false` los desactiva).
