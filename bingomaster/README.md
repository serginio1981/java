# BingoMaster

Aplicación de escritorio para Windows para conducir bingos presenciales: panel del
operador en el notebook y pantalla pública en el proyector. 100% offline (salvo la
importación de cartones con IA, fase 5).

## Estado

| Fase | Contenido | Estado |
|---|---|---|
| F1 | Esqueleto, estado en main, ventanas operador y pública sincronizadas, ingreso de números, tablero, deshacer, recuperación de sesión, build Windows en CI | **Hecha** |
| F2 | Eventos, cartones propios, PDF | Pendiente |
| F3 | Figuras, secuencia de juegos, validación por serie+folio, ingreso manual de externos | Pendiente |
| F4 | Pulido de pantalla pública, instalador NSIS final | Pendiente |
| F5 | Importación de cartones con IA de visión | Pendiente |

## Desarrollo

Requiere Node 22+.

```bash
cd bingomaster
npm install
npm run dev        # app con recarga en caliente
npm test           # pruebas unitarias (Vitest)
npm run typecheck  # verificación de tipos
npm run build      # compila a out/
npm start          # ejecuta lo compilado
npm run dist:win   # instalador NSIS (en Windows; en CI se hace solo)
```

Prueba de punta a punta (Electron real con Playwright; necesita pantalla, en Linux
usar `xvfb-run -a`): `npm run build && node tests/e2e/f1.e2e.cjs [carpeta-capturas]`.
Requiere `playwright` instalado (no es dependencia del proyecto).

### Instalador de Windows

El workflow `.github/workflows/bingomaster-windows.yml` (raíz del repo) corre en
`windows-latest` con cada push que toque `bingomaster/`: tipos, pruebas, empaquetado
NSIS, **prueba de humo del `.exe` empaquetado** (`BingoMaster.exe --smoke-test`) y
publica el instalador como artefacto descargable desde la pestaña Actions.

## Uso (F1)

- **Cantar:** escribir el número en el teclado numérico y Enter. También acepta `B12`.
  Fuera de rango, repetido o letra equivocada se avisa en rojo y no se registra.
- **Tablero:** clic en un número lo pone en el campo; Enter lo canta (evita cantar
  por un clic accidental).
- **Deshacer:** tecla `−` del teclado numérico (con el campo vacío) o Ctrl+Z → diálogo
  de confirmación. El foco queda en "Cancelar": Enter cancela.
- **Pantalla pública:** elegir pantalla y "Abrir". Si hay proyector se abre a pantalla
  completa en él; si no, en ventana sobre la principal. "Mover" la cambia de pantalla.
- En F1 se crea solo un "Evento de prueba"; la gestión de eventos llega en F2.

## Decisiones técnicas

- **Electron 45 + React 19 + TypeScript 7 + Vite 8**, compilado con electron-vite.
- **SQLite con `node:sqlite` (integrado en Node) en vez de better-sqlite3.**
  Verificado el 7-nov-2026: better-sqlite3 13.0.3 no publica binario precompilado para
  Electron 45 (ABI 150; la descarga da 404), por lo que habría que compilarlo con
  herramientas nativas de Visual Studio en cada build de Windows. `node:sqlite` viene
  dentro de Electron 45 (Node 24.22.2), no requiere compilar nada, es SQLite real en
  archivo y tiene API síncrona similar. Riesgo: en Node la API figura como
  experimental; queda aislada en `src/main/db/` para poder cambiarla.
- **Autoguardado:** cada comando corre en una transacción (`BEGIN IMMEDIATE`/`COMMIT`)
  con WAL y `synchronous=FULL`. No hay "guardar": al reabrir, el evento activo y lo
  cantado se recuperan.
- **Estado único en el proceso main.** Las ventanas mandan comandos tipados
  (`src/shared/ipc/contract.ts`) y reciben el estado completo tras cada cambio. La
  ventana pública recibe solo una proyección pública (sin datos del operador).
- **Offline:** el proceso main cancela toda petición de red de las ventanas y no
  concede permisos (cámara, etc.) en F1. Una sola instancia de la app.
- **Base de datos:** `%APPDATA%\BingoMaster\bingomaster.db` (se muestra en el pie del
  panel). El desinstalador no la borra.
- La columna de orden de `games` se llama `position` (`order` es palabra reservada).

## Estructura

```
src/shared/      reglas del bingo y contrato IPC (puro, probado con Vitest)
src/main/        db, events, calls, state, windows, smoke (prueba de humo)
src/preload/     puente seguro
src/renderer/    operator/ (panel), public/ (proyector), ui/ (tablero, tema)
tests/           Vitest + e2e/ (Playwright + Electron)
```
