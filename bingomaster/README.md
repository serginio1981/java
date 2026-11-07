# BingoMaster

Aplicación de escritorio para Windows para conducir bingos presenciales: panel del
operador en el notebook y pantalla pública en el proyector. 100% offline, salvo la
importación de cartones con IA.

## Estado

Las 5 fases están implementadas y probadas en Linux (pruebas unitarias + prueba de punta a
punta en Electron) y empaquetadas para Windows en GitHub Actions.

| Fase | Contenido |
|---|---|
| F1 | Estado único en main, ventanas operador y pública sincronizadas, ingreso de números, tablero, deshacer |
| F2 | Eventos, generación de cartones propios, PDF (Carta/A4, 1/2/4 por hoja, rango de folios) |
| F3 | Editor de figuras, secuencia de juegos, ¡BINGO! por folio, ganadores, ingreso manual de externos |
| F4 | Pantalla pública (figura en juego, "Juego X de Y", overlay ¡BINGO!), recuperación de sesión, instalador NSIS |
| F5 | Importación de cartones externos con IA de visión, doble lectura, revisión obligatoria |

**No probado:** instalación en Windows real, proyector físico, webcam real y la API de
Claude real (se probó con un servidor que la simula).

## Uso rápido

1. **Evento y juegos:** "Nuevo evento" (nombre, fecha, código de serie, si los números se
   acumulan). Se carga una secuencia inicial (Primeros 3 → Línea → X → Cartón lleno) que
   se puede editar: agregar, quitar, reordenar, cambiar figura, elegir el juego en curso.
2. **Cartones:** generar N cartones (folios SERIE-0001…; la numeración continúa) y exportar
   PDF. Para reimprimir, indicar el rango de folios.
3. **Juego:** escribir el número + Enter (teclado numérico). `−` o Ctrl+Z deshace (con
   confirmación). **F2** o `*` abre ¡BINGO!: folio → cartón con lo cantado → VÁLIDO / NO
   VÁLIDO → registrar ganador → mostrar en la pública. **Terminar juego** cierra el juego con o
   sin ganador. El panel derecho
   muestra (solo al operador) cuántos cartones completan la figura y cuántos están a 1.
4. **Cartones externos:** pestaña Cartones → "Ingreso manual" (serie, folio y 24 números,
   el cursor avanza solo, Ctrl+Enter guarda) o pestaña "Importar con IA" (webcam, archivo,
   carpeta compartida; revisión obligatoria antes de guardar).
5. **Ajustes:** API key (cifrada con safeStorage), modelo, doble lectura, carpeta compartida.

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
- Eventos sin juegos (por ejemplo, el "Evento de prueba" creado por la versión F1) muestran el
  botón "Cargar secuencia inicial".
- Deshacer solo afecta números del juego en curso.
- Identidad del cartón = serie + folio; no se puede repetir en el evento.

### Supuestos que conviene confirmar

- **Desempate:** hay una ayuda (se escribe una bola de desempate, no se registra como
  cantada, y se muestra qué cartón empatado la tiene). La regla exacta está pendiente de
  confirmar con el cliente.
- **Modo acumulado y bingo tardío:** con números acumulados, un cartón que ya tenía la
  figura del juego nuevo al empezarlo queda NO VÁLIDO (no se completó con el último número).
- **Cartones a 1 número / completos** se calcula sobre todos los cartones registrados del
  evento (propios y externos), no solo los vendidos.

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

Prueba de punta a punta (Electron real + Playwright, API de Claude simulada; en Linux usar
`xvfb-run -a`): `npm run build && node tests/e2e/full.e2e.cjs [carpeta-capturas]`.
Requiere `playwright` instalado aparte.

### Instalador de Windows

`.github/workflows/bingomaster-windows.yml` (raíz del repo) corre en `windows-latest` en
cada push que toque `bingomaster/`: tipos, pruebas, instalador NSIS, prueba de humo del
`.exe` empaquetado y publica el instalador como artefacto en la pestaña Actions. No está
firmado: Windows SmartScreen pedirá "Más información → Ejecutar de todas formas".

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
- **Importación con IA**: SDK oficial `@anthropic-ai/sdk` 1.6 desde el proceso main,
  salida estructurada con JSON Schema, `fallbacks: "default"` en modelos que lo aceptan.
  Modelo por defecto `claude-opus-5-5` (configurable). Las ventanas no tienen red.
- **Permisos:** solo cámara (video) y solo para la ventana del operador.
- **Datos:** `%APPDATA%\BingoMaster\bingomaster.db` y fotos en `imagenes\`. El desinstalador
  no los borra.

## Estructura

```
src/shared/      bingo (grilla, números), patterns, validation, import-ai, ipc  — puro, probado
src/main/        db, events, games, calls, cards, patterns, winners, printing,
                 import-ai, settings, state, windows, smoke
src/preload/     puente seguro
src/renderer/    operator/ (pestañas), public/ (proyector), ui/ (componentes)
tests/           Vitest + e2e/full.e2e.cjs
```
