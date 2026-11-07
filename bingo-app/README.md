# Bingo – Importar cartones externos (sección 6)

App de escritorio (Electron) para registrar cartones **de otro origen** (comerciales
con serie y folio impresos, o generados por otra app) en un evento, para validarlos
por folio igual que los propios.

> **Contexto importante:** en este repositorio no existía la app de bingo de las
> secciones 1 a 5 de la especificación. Este módulo se construyó **autocontenido**,
> con un modelo de datos mínimo (eventos + cartones en JSON). Para integrarlo con la
> app real hay que adaptar `src/main/store.js` a su almacenamiento; ver
> "Supuestos" más abajo.

## Uso

```bash
cd bingo-app
npm install
npm start      # abre la app
npm test       # tests de validación, petición/lectura de la API y almacenamiento
```

Requiere Node 22+.

## Qué hace

| Requisito | Implementación |
|---|---|
| Captura por webcam | `getUserMedia` en el renderer; selector de cámara; marco guía en pantalla. |
| Imagen subida | Arrastrar y soltar o selector de archivo (JPG, PNG, WEBP). |
| Carpeta compartida con el celular | Se elige en Ajustes; se vigila con `fs.watch` y se listan las imágenes, marcando las ya importadas. |
| 1 a 4 cartones por foto | Selector "Cartones en la foto"; el prompt lo indica; la respuesta se corta a 4. |
| Lectura con Claude desde el proceso main | `src/main/vision.js` con el SDK oficial `@anthropic-ai/sdk`. Imagen en base64 + salida estructurada (`output_config.format` con JSON Schema): serie, folio, columnas B-I-N-G-O, centro FREE (`null`). |
| Modelo configurable | Ajustes → "Modelo". Por defecto `claude-opus-5-5`. |
| Validación automática | `src/shared/carton.js`: 24 números + FREE, rangos por columna (B 1-15 … O 61-75), sin repetidos, folio presente. Si falla, el cartón se marca **DUDOSO** y las celdas en rojo/amarillo. |
| Doble lectura opcional | Dos llamadas independientes en paralelo; las celdas, serie o folio que difieren se resaltan como dudosos. Si una de las dos falla, se muestra la otra y todo el cartón queda dudoso. |
| Confirmación obligatoria | Pantalla de revisión: foto (con zoom) y cartones reconstruidos lado a lado; se edita celda por celda. El botón "Confirmar y guardar" solo se habilita si el cartón es válido **y** el operador marca "Comparé este cartón con la foto". El proceso main vuelve a validar y rechaza todo guardado sin `confirmado: true`. |
| Origen "externo", serie y folio tal cual | Se guardan como texto, sin quitar ceros a la izquierda. Se guarda también la foto. |
| Aviso de serie+folio repetido | Antes de guardar se consulta; si existe, se muestra un aviso y hay que pulsar "Guardar de todas formas". Queda marcado `duplicadoForzado`. |
| Fallback sin internet / sin API | Pestaña "Ingreso manual": serie, folio y 24 números con avance automático (el cursor salta cuando el número ya no admite otro dígito para esa columna), Enter/Tab, flechas, retroceso, teclado numérico en pantalla, Ctrl+Enter para guardar, opción de mantener la serie. Si la API falla, también se puede transcribir a mano con la foto al lado. |
| API key cifrada | `safeStorage` de Electron. Si el sistema no ofrece cifrado, **no se guarda** la clave. En Linux sin llavero (backend `basic_text`) se avisa que el cifrado es débil. La clave nunca llega al renderer. |
| Único módulo con internet | El renderer tiene CSP `connect-src 'none'` y además el proceso main cancela toda petición http/https que salga de la ventana. Solo `vision.js` (proceso main) llama a la API. |
| Guía de captura | Panel fijo en la pantalla de captura. |

## Supuestos y decisiones (revisar)

Tomé estas decisiones porque la especificación de las secciones 1-5 no estaba disponible:

1. **Stack:** Electron + JavaScript sin bundler; almacenamiento en JSON en la carpeta
   `userData` (escritura atómica). Si la app real usa SQLite u otro motor, hay que
   reemplazar `Store`.
2. **Evento:** concepto mínimo (id + nombre). La detección de duplicados y la búsqueda
   por folio son por evento activo.
3. **Comparación de duplicados:** ignora espacios y mayúsculas, **no** ceros a la
   izquierda (`0123` ≠ `123`). Si los cartones comerciales imprimen el mismo folio con
   y sin ceros, habría que cambiar `Carton.claveIdentidad`.
4. **Cartón inválido no se guarda**, aunque el operador insista: un cartón real de 75
   bolas siempre cumple las reglas, así que un error indica una mala transcripción.
5. **Tamaño de imagen:** se reduce a 2000 px en el lado mayor (JPEG 90%). No verifiqué
   el límite óptimo de resolución del modelo para leer 4 cartones en una foto; conviene
   probar con cartones reales y ajustar `MAX_LADO` en `src/renderer/app.js`.
6. **Fallback server-side:** para `claude-opus-5-5`, `claude-opus-5`, `claude-fable-5-1`
   y `claude-sonnet-5-5` se envía `fallbacks: "default"` (beta
   `server-side-fallback-2026-07-01`): si un clasificador de seguridad rechaza la
   petición, la API la reintenta en otro modelo. Con otros modelos se omite. Si la
   respuesta final es un rechazo, se ofrece el ingreso manual.
7. **Esfuerzo:** `output_config.effort = "high"`, priorizando exactitud sobre costo.
   La doble lectura duplica el costo por foto.

## Verificación hecha

- `npm test`: 26 tests (reglas del cartón, construcción de la petición y lectura de la
  respuesta, almacenamiento y duplicados).
- Prueba de punta a punta en Electron con Playwright contra un **servidor simulado**
  de la API (no contra la API real): ingreso manual, guardado, aviso de duplicado,
  lectura con doble lectura y celdas dudosas, confirmación, búsqueda por folio,
  bloqueo de red del renderer.
- **No probado** con la API real ni con una webcam física ni con cartones reales.
  Antes de usarlo en un evento, conviene probar con varias fotos de cartones reales
  y comparar la tasa de celdas dudosas.

## Estructura

```
src/main/main.js            ventana, IPC, bloqueo de red, carpeta compartida
src/main/vision.js          llamada a la API de Claude (único acceso a internet)
src/main/vision-request.js  prompt, esquema JSON, interpretación y doble lectura (puro)
src/main/store.js           eventos y cartones (JSON)
src/main/settings.js        ajustes y API key con safeStorage
src/shared/carton.js        reglas del cartón (main + renderer)
src/preload.js              puente seguro renderer ↔ main
src/renderer/               interfaz (captura, revisión, manual, lista, ajustes)
test/                       tests con node:test
```
