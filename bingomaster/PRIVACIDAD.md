# Política de privacidad de Bingo Master

**Última actualización:** 7 de noviembre de 2026

Bingo Master es una aplicación de escritorio para Windows que ayuda a conducir bingos
presenciales. Esta política explica qué datos maneja la aplicación, dónde se guardan y cuándo
salen del equipo.

**Responsable:** Sergio Aedo Mena — contacto: [contacto@saedo.cl](mailto:contacto@saedo.cl)

## 1. Resumen

- La aplicación **no tiene cuentas de usuario, publicidad, analítica ni telemetría**.
- Todos los datos se guardan **solo en el equipo** donde está instalada.
- La única función que se conecta a internet es la **importación de cartones con IA**, que es
  opcional y solo se usa si el operador la activa con su propia API key.
- **No vendemos ni compartimos** datos con terceros.

## 2. Datos que se guardan en el equipo

La aplicación guarda localmente, en la carpeta de datos de la aplicación del usuario de Windows:

- Eventos (nombre, fecha, código de serie), juegos y figuras.
- Cartones: serie, folio y números de cada cartón.
- Números cantados y ganadores registrados (serie, folio, juego y cantidad de números).
- Fotos de cartones externos importados con IA (si se usa esa función).
- Ajustes, incluida la API key de Anthropic **cifrada** con el sistema de protección de datos de
  Windows.

La aplicación no solicita nombres, teléfonos, correos ni otros datos personales de los
jugadores. Si el operador escribe datos personales en algún campo (por ejemplo, en el nombre de
un evento), esos datos también quedan solo en el equipo.

Los datos no salen del equipo, salvo en estos casos:

- Cuando el operador usa la importación con IA (sección 3).
- Cuando el operador crea un respaldo y lo guarda donde decida.
- Si el usuario tiene activadas las copias de seguridad de Windows en OneDrive, Windows puede
  incluir los datos de la aplicación en esas copias, según la configuración del propio usuario.

## 3. Cámara e importación de cartones con IA

- La **cámara** solo se activa cuando el operador pulsa "Encender cámara" en la sección
  "Importar con IA". Solo se guarda la foto que el operador captura; el video no se graba ni se
  envía.
- Cuando el operador pide leer una foto, la aplicación la envía de forma cifrada (HTTPS)
  **directamente a la API de Anthropic** (proveedor del modelo de IA Claude), usando la API key
  del propio operador. La foto se usa para obtener la serie, el folio y los números del cartón.
- El tratamiento de esas imágenes por parte de Anthropic se rige por los términos y la política
  de privacidad de Anthropic, que el titular de la API key acepta al contratar el servicio.
  Puede consultarlos en el sitio web de Anthropic (anthropic.com).
- Recomendamos fotografiar **solo los cartones**, sin personas ni documentos alrededor.
- Sin API key, o sin conexión a internet, esta función no envía nada y los cartones se pueden
  ingresar a mano.

## 4. Datos de niños

La aplicación es una herramienta para organizadores de bingos y no está dirigida a niños. No
recopila de forma intencional datos de menores de edad.

## 5. Conservación y eliminación

Los datos se conservan en el equipo hasta que el usuario los elimina. Para eliminarlos:

- **Versión de Microsoft Store:** al desinstalar la aplicación, Windows elimina sus datos.
- **Versión con instalador:** elimine la carpeta `%APPDATA%\BingoMaster` después de desinstalar.
- Los archivos de respaldo que el usuario haya creado se eliminan por separado.
- La API key se puede borrar en cualquier momento desde Ajustes.

Como no tenemos acceso a los datos guardados en su equipo, no podemos consultarlos, corregirlos
ni eliminarlos a distancia. El control lo tiene el usuario.

## 6. Cambios a esta política

Si la aplicación cambia la forma en que maneja los datos, actualizaremos esta política y su fecha
de "Última actualización".

## 7. Contacto

Si tiene preguntas sobre esta política o sobre la aplicación, escriba a
[contacto@saedo.cl](mailto:contacto@saedo.cl).
