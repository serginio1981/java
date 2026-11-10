# BingoMaster (Bingo Master)

Aplicación de escritorio para Windows para conducir bingos presenciales: panel del
operador en el notebook y pantalla pública en el proyector. Funciona sin internet, salvo
la lectura opcional de cartones con IA.

## Estado

| | |
|---|---|
| **Publicada en Microsoft Store** | Versión **0.2.0** — https://apps.microsoft.com/store/detail/9NJNBTJDGTZ3?cid=DevShareMCLPCS (ID `9NJNBTJDGTZ3`) |
| **Versión actual del código** | **0.3.1**, lista para enviar a la Store (paquete `BingoMaster-Store-0.3.1.appx`) |
| **Sitio web** | https://bingomaster.net/ (fuente en [`website/`](website/LEEME.md)) |
| **Política de privacidad** | https://bingomaster.net/privacidad.html (fuente [`PRIVACIDAD.md`](PRIVACIDAD.md), versión 1.1) |
| **Soporte** | contacto@saedo.cl |

Los enlaces públicos están centralizados en `src/shared/links.ts`.

### Historial de versiones

| Versión | Cambios |
|---|---|
| 0.3.1 | Eliminar eventos con todo su historial (con confirmación escribiendo ELIMINAR). |
| 0.3.0 | Proveedor de IA elegible (Anthropic Claude, OpenAI GPT, Google Gemini o servidor compatible con OpenAI, como Ollama/LM Studio), cada uno con su clave cifrada, modelo ("Listar modelos") y autorización de privacidad. Menú Ayuda con sitio web, Microsoft Store (ver y calificar) y soporte. |
| 0.2.0 | Primera versión publicada en Microsoft Store: fases F1–F5, terminar juego con o sin ganador, manual de usuario (F1), respaldo y restauración, consentimiento de IA. |

### Fases implementadas

| Fase | Contenido |
|---|---|
| F1 | Estado único en main, ventanas operador y pública sincronizadas, ingreso de números, tablero, deshacer |
| F2 | Eventos, generación de cartones propios, PDF (Carta/A4, 1/2/4 por hoja, rango de folios) |
| F3 | Editor de figuras, secuencia de juegos, ¡BINGO! por folio, ganadores, ingreso manual de externos |
| F4 | Pantalla pública (figura en juego, "Juego X de Y", overlay ¡BINGO!), recuperación de sesión, instalador NSIS |
| F5 | Importación de cartones externos con IA de visión, doble lectura, revisión obligatoria |

Probado en Linux (78 pruebas unitarias + prueba de punta a punta en Electron real) y
empaquetado y con prueba de humo en Windows en GitHub Actions.

**No probado:** proyector físico, webcam real y las API reales de los proveedores de IA (se
probaron con un servidor local que simula Anthropic, OpenAI y Gemini). El paquete de la
Store no se ha pasado por el Windows App Certification Kit localmente; lo valida Microsoft
al certificar (la 0.2.0 fue certificada y publicada).

## Manual de usuario

Incluido en la app (offline): botón **? Manual** en la barra superior, menú **Ayuda → Manual de
usuario** o tecla **F1**. Fuente: `src/renderer/manual.html` (+ `manual/`). Las capturas del
manual se regeneran con `MANUAL_SHOTS=src/renderer/manual/img node tests/e2e/full.e2e.cjs`.
La barra de menú está en español (Archivo, Edición, Ver, Ventana pública, Ayuda).

## Uso rápido

1. **Evento y juegos:** "Nuevo evento" (nombre, fecha, código de serie, si los números se
   acumulan). Se carga una secuencia inicial (Primeros 3 → Línea → X → Cartón lleno) que
   se puede editar: agregar, quitar, reordenar, cambiar figura, elegir el juego en curso.
   **Activar** cambia de evento; **Eliminar** borra un evento con todo su historial (ver
   reglas abajo).
2. **Cartones:** generar N cartones (folios SERIE-0001…; la numeración continúa) y exportar
   PDF. Para reimprimir, indicar el rango de folios.
3. **Juego:** escribir el número + Enter (teclado numérico). `−` o Ctrl+Z deshace (con
   confirmación). **F2** o `*` abre ¡BINGO!: folio → cartón con lo cantado → VÁLIDO / NO
   VÁLIDO → registrar ganador → mostrar en la pública. **Terminar juego** cierra el juego con o
   sin ganador. El panel derecho muestra (solo al operador) cuántos cartones completan la
   figura y cuántos están a 1.
4. **Cartones externos:** pestaña Cartones → "Ingreso manual" (serie, folio y 24 números,
   el cursor avanza solo, Ctrl+Enter guarda) o pestaña "Importar con IA" (webcam, archivo,
   carpeta compartida; revisión obligatoria antes de guardar).
5. **Ajustes:** proveedor de IA (Anthropic, OpenAI, Google Gemini o compatible con OpenAI +
   URL), clave de API por proveedor (cifrada con safeStorage), modelo con "Listar modelos",
   doble lectura, carpeta compartida, **Respaldar / Restaurar** la base de datos.

### Reglas implementadas

- Un número se canta una vez (dentro de los vigentes); rango 1–75; letra por rango.
- marcados = (números del cartón ∩ cantados vigentes) ∪ {FREE}. Se valida con lo cantado
  en la app, nunca con lo marcado a lápiz. Igual para propios y externos.
- **Un bingo es VÁLIDO solo si la figura se completó con el último número cantado.** Si se
  completó antes, se informa en qué número y se marca NO VÁLIDO.
- "Línea (cualquiera)" = 5 filas + 5 columnas + 2 diagonales.
- Varios ganadores por juego: se registran todos.
- **Terminar juego** (panel derecho o diálogo ¡BINGO!) cierra el juego en curso haya tenido
  ganador o no, y pasa al siguiente pendiente. En el último juego también está disponible: al
  terminarlo se cierra la secuencia (la pública muestra "¡Gracias por jugar!"). Un juego
  terminado se puede reabrir desde "Evento y juegos".
- **Eliminar evento:** muestra cuántos juegos, cartones, números y ganadores se borrarán y
  exige escribir ELIMINAR. Borra todo en una transacción, incluidas las fotos de cartones
  externos guardadas en la carpeta de imágenes de la app. No se puede deshacer (conviene
  respaldar antes). Si era el evento activo se activa el más reciente que quede; si no queda
  ninguno se crea un "Evento de prueba" vacío, porque la app siempre necesita un evento activo.
- Eventos sin juegos muestran el botón "Cargar secuencia inicial".
- Deshacer solo afecta números del juego en curso.
- Identidad del cartón = serie + folio; no se puede repetir en el evento.
- La IA solo se usa tras aceptar el aviso de privacidad de ese proveedor; las ventanas no
  tienen red, solo el proceso main llama a la API elegida.

### Supuestos que conviene confirmar

- **Desempate:** hay una ayuda (se escribe una bola de desempate, no se registra como
  cantada, y se muestra qué cartón empatado la tiene). La regla exacta está pendiente de
  confirmar con el cliente.
- **Modo acumulado y bingo tardío:** con números acumulados, un cartón que ya tenía la
  figura del juego nuevo al empezarlo queda NO VÁLIDO (no se completó con el último número).
- **Cartones a 1 número / completos** se calcula sobre todos los cartones registrados del
  evento (propios y externos), no solo los vendidos.
- **Inicio de sesión con ChatGPT/Gemini/Claude en vez de clave de API:** evaluado y no
  implementado. Anthropic prohíbe usar suscripciones Pro/Max en apps de terceros; el OAuth de
  Google no usa la suscripción Gemini; "Sign in with ChatGPT" de OpenAI (2026) no está
  confirmado como abierto a cualquier desarrollador. Se mantiene la clave de API.

## Desarrollo

Requiere Node 22+.

```bash
cd bingomaster
npm install
npm run dev        # app con recarga en caliente
npm test           # pruebas unitarias (Vitest)
npm run typecheck  # tipos
npm run build && npm start
```

Prueba de punta a punta (Electron real + Playwright, APIs de IA simuladas; en Linux usar
`xvfb-run -a`): `npm run build && node tests/e2e/full.e2e.cjs [carpeta-capturas]`.
Requiere `playwright` instalado aparte.

### Microsoft Store

`electron-builder.yml` → sección `appx` con la identidad de Partner Center (Bingo Master,
`SergioAedoMena.BingoMaster`, capacidades `runFullTrust`, `internetClient`, `webcam`). La CI
genera `BingoMaster-Store-<versión>.appx` (sin firmar: la Store lo firma) como artefacto
**BingoMaster-Store**; se sube en Partner Center → Envíos → Paquetes. Localmente en Windows:
`npm run dist:store`. Logos en `build/appx/` e ícono en `build/icon.png` (generados desde
`build/icon.svg`).

Textos, capturas e imágenes de la ficha, y los pasos para publicar una actualización:
[`store/FICHA_STORE.md`](store/FICHA_STORE.md). Para cada envío nuevo hay que subir
`version` en `package.json` (la Store exige una versión mayor que la publicada).

Ajustes → **Respaldar / Restaurar** base de datos: necesario porque Windows borra los datos de
una app de la Store al desinstalarla.

### Sitio web

Estático, en [`website/`](website/LEEME.md). `privacidad.html` se genera desde `PRIVACIDAD.md`
con `node scripts/build-website.mjs`. Se publica en un bucket de Google Cloud Storage: subir el
**contenido** de la carpeta (no el zip) a la raíz del bucket y, para ver los cambios de
inmediato, dejar el HTML con `Cache-Control: no-cache`.

### Instalador de Windows

`.github/workflows/bingomaster-windows.yml` (raíz del repo) corre en `windows-latest` en
cada push que toque `bingomaster/`: tipos, pruebas, instalador NSIS, prueba de humo del
`.exe` empaquetado, paquete AppX con verificación de la identidad del manifiesto, y publica
los artefactos **BingoMaster-Setup** y **BingoMaster-Store** en la pestaña Actions. El
instalador NSIS no está firmado: Windows SmartScreen pedirá "Más información → Ejecutar de
todas formas" (la versión de la Store no tiene ese problema).

## Decisiones técnicas

- **Electron 45 + React 19 + TypeScript 7 + Vite 8** (electron-vite).
- **SQLite con `node:sqlite`** (incluido en Electron 45 / Node 24) en vez de better-sqlite3,
  que no publica binario precompilado para Electron 45 (verificado: 404) y habría que
  compilarlo en Windows. En Node la API figura como experimental; queda aislada en
  `src/main/db/`.
- **Autoguardado:** cada comando es una transacción con WAL y `synchronous=FULL`.
- **Estado único en main**; las ventanas mandan comandos tipados (`src/shared/ipc/contract.ts`)
  y reciben el estado tras cada cambio. La pública recibe solo campos públicos y no puede
  enviar comandos.
- **Figuras como máscaras de 25 bits**: la evaluación de miles de cartones por número es
  barata. Medido: 100.000 cartones → ~27 ms por número cantado, ~36 ms buscar folio.
- **PDF** con `printToPDF` desde una ventana oculta (offline).
- **Importación con IA, proveedor elegible** (Ajustes): Anthropic (`@anthropic-ai/sdk`), OpenAI y
  servidores compatibles como Ollama/LM Studio (`openai`) y Google Gemini (`@google/genai`), todos
  desde el proceso main, cada uno con su clave cifrada, modelo ("Listar modelos") y consentimiento.
  Salida estructurada con JSON Schema donde el proveedor lo acepta; con servidores compatibles
  que no lo soportan se reintenta pidiendo JSON por instrucción. Modelo por defecto de
  Anthropic `claude-opus-5-5` (configurable); para los demás se elige con "Listar modelos".
- **Permisos:** solo cámara (video) y solo para la ventana del operador.
- **Datos:** `%APPDATA%\BingoMaster\bingomaster.db` y fotos en `imagenes\`. El desinstalador
  NSIS no los borra; la desinstalación de la versión de la Store sí.

## Estructura

```
src/shared/      bingo (grilla, números), patterns, validation, import-ai, ipc, links — puro, probado
src/main/        db, events, games, calls, cards, patterns, winners, printing,
                 import-ai, settings, state, windows, smoke
src/preload/     puente seguro
src/renderer/    operator/ (pestañas), public/ (proyector), ui/ (componentes), manual
tests/           Vitest + e2e/full.e2e.cjs
store/           ficha de Microsoft Store, capturas e imágenes
website/         sitio bingomaster.net
build/           ícono y logos del paquete
```
