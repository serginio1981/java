# Política de Privacidad — Bingo Master

**Versión:** 1.1
**Fecha de entrada en vigor:** 7 de noviembre de 2026
**Aplicación:** Bingo Master para Windows (distribuida a través de Microsoft Store y mediante instalador)

---

## 1. Identificación del responsable

La aplicación Bingo Master (en adelante, la "**Aplicación**") es desarrollada y publicada por
**Sergio Aedo Mena** (en adelante, el "**Desarrollador**").

- Correo electrónico de contacto en materias de privacidad: **[contacto@saedo.cl](mailto:contacto@saedo.cl)**

## 2. Objeto y alcance

La presente Política de Privacidad (la "**Política**") informa de manera clara y transparente:

1. Qué datos, incluidos datos personales, accede, recopila o transmite la Aplicación.
2. Con qué finalidad se tratan y sobre qué base.
3. Dónde y cómo se almacenan y protegen.
4. A qué tipo de terceros se comunican.
5. Qué controles y derechos tienen los usuarios y cómo pueden ejercerlos.

Esta Política se aplica exclusivamente a la Aplicación. No se aplica a servicios de terceros
(como Microsoft Store, Windows o el proveedor de inteligencia artificial), que se rigen por sus
propias políticas, indicadas en esta Política.

## 3. Definiciones

- **Datos personales:** cualquier información vinculada o referida a una persona natural
  identificada o identificable.
- **Tratamiento:** cualquier operación sobre datos, como recolección, almacenamiento, uso,
  comunicación, transmisión o eliminación.
- **Operador:** la persona u organización que instala y usa la Aplicación para conducir bingos.
- **Jugador:** la persona que participa en un bingo conducido con la Aplicación.
- **Proveedor de IA:** el servicio de inteligencia artificial que el Operador elija para la
  función opcional de importación de cartones: Anthropic, PBC (Claude), OpenAI (GPT), Google LLC
  (Gemini), o un servidor compatible con la API de OpenAI que el propio Operador configure (por
  ejemplo, un servidor local con Ollama o LM Studio).

## 4. Principio general: tratamiento local

La Aplicación está diseñada para funcionar **sin conexión a internet** y **sin servidores del
Desarrollador**. En consecuencia:

- La Aplicación **no tiene cuentas de usuario, no muestra publicidad y no incorpora herramientas
  de analítica, telemetría, seguimiento ni cookies**.
- Los datos que el Operador registra se almacenan **únicamente en el equipo** donde está instalada
  la Aplicación.
- **El Desarrollador no recibe, no accede, no almacena y no puede consultar** los datos que el
  Operador registra en la Aplicación.

Respecto de esos datos, el Desarrollador no actúa como responsable ni como encargado del
tratamiento. El Operador decide qué información registra y si utiliza la función opcional de
importación con IA (sección 6).

## 5. Datos que la Aplicación accede, recopila o transmite

| Categoría de datos | Finalidad | Lugar de almacenamiento | ¿Sale del equipo? |
|---|---|---|---|
| Datos de eventos: nombre, fecha, código de serie, secuencia de juegos y figuras | Organizar y conducir el bingo | Equipo del Operador | No |
| Datos de cartones: serie, folio y números de cada cartón | Validar los "¡bingo!" por folio | Equipo del Operador | No |
| Números cantados y ganadores registrados (serie, folio, juego, cantidad de números) | Llevar el registro del juego | Equipo del Operador | No |
| Imagen de la cámara (solo al encenderla el Operador) | Fotografiar cartones externos | No se graba video. Solo se conserva la foto que el Operador captura | Solo si el Operador solicita su lectura con IA (sección 6) |
| Fotografías de cartones externos | Leer serie, folio y números del cartón | Equipo del Operador | Solo si el Operador solicita su lectura con IA (sección 6) |
| Claves de API ("API keys") de los Proveedores de IA que configure el Operador | Autenticar al Operador ante el Proveedor de IA | Equipo del Operador, cifradas | Cada clave solo hacia su Proveedor de IA, al usar la función de importación |
| Archivos de respaldo de la base de datos | Respaldar y restaurar la información | Donde el Operador decida guardarlos | Solo si el Operador los copia o comparte |

**Datos de Jugadores.** La Aplicación **no solicita** nombres, RUT, teléfonos, correos ni otros
datos personales de los Jugadores. Un cartón se identifica solo por su serie y folio. Si el
Operador decide escribir datos personales en algún campo libre (por ejemplo, el nombre de un
evento) o fotografía cartones con datos personales escritos a mano, esos datos quedarán
almacenados en su equipo bajo su responsabilidad.

## 6. Función opcional de importación de cartones con inteligencia artificial

### 6.1 Funcionamiento

La Aplicación ofrece una función **opcional** para leer cartones de bingo a partir de una
fotografía. Esta función:

1. Solo opera si el Operador **elige un Proveedor de IA** y lo configura con **su propia API
   key** (o, en el caso de un servidor compatible, con la dirección de ese servidor).
2. Antes del primer uso con **cada** Proveedor de IA muestra un **aviso que el Operador debe
   aceptar expresamente**, que identifica a quién se enviará la fotografía.
3. Envía la fotografía **directamente desde el equipo del Operador al Proveedor de IA elegido**,
   sin pasar por servidores del Desarrollador. Con los proveedores en la nube la conexión es
   cifrada (HTTPS); con un servidor compatible, la conexión depende de la dirección que configure
   el Operador.
4. Recibe como respuesta la serie, el folio y los números leídos, que el Operador **debe revisar
   y confirmar** antes de guardarlos.

### 6.2 Destinatarios y condiciones

La fotografía se envía **solo al Proveedor de IA que el Operador haya elegido** en Ajustes:

| Proveedor de IA | Destinatario | Condiciones aplicables |
|---|---|---|
| Anthropic (Claude) | Anthropic, PBC y sus afiliadas (Estados Unidos) | [Términos Comerciales](https://www.anthropic.com/legal/commercial-terms) y [Política de Privacidad](https://www.anthropic.com/legal/privacy) de Anthropic |
| OpenAI (GPT) | OpenAI y sus afiliadas (Estados Unidos) | Términos y política de privacidad de la plataforma de API de OpenAI (openai.com) |
| Google (Gemini) | Google LLC y sus afiliadas (Estados Unidos) | Términos de la API de Gemini y política de privacidad de Google (ai.google.dev y policies.google.com) |
| Servidor compatible | El servidor cuya dirección configure el Operador | Las condiciones de quien opere ese servidor. Si es un servidor local en el mismo equipo o red, la fotografía no sale a internet |

- La relación entre el Operador y el Proveedor de IA se rige por los términos que el Operador
  acepta al obtener su API key o al usar su servidor. Por ejemplo, al momento de redactar esta
  Política, los Términos Comerciales de Anthropic (vigentes desde el 17 de junio de 2025)
  establecen que Anthropic no puede entrenar modelos con el contenido del cliente. Cada
  proveedor define sus propias reglas sobre conservación y uso de los datos, y pueden cambiar:
  se recomienda revisarlas antes de elegir un proveedor. El Desarrollador no controla esos
  documentos.
- **Transferencia internacional:** con los proveedores en la nube, la fotografía se transfiere a
  servidores ubicados fuera de Chile, posiblemente en los Estados Unidos de América u otros
  países donde opere el proveedor elegido.

### 6.3 Recomendaciones y alternativas

- Fotografíe **solo los cartones**, sin personas, rostros ni documentos alrededor.
- Si no desea transmitir imágenes, **no use esta función**: los cartones se pueden ingresar
  manualmente sin ninguna conexión a internet.

## 7. Base de legitimación

- **Funciones locales:** el tratamiento se realiza en el equipo del Operador y por su decisión,
  para ejecutar las funciones de la Aplicación que el propio Operador utiliza.
- **Importación con IA:** el envío de fotografías al Proveedor de IA se basa en el
  **consentimiento expreso** del Operador, otorgado en el aviso previo al primer uso y renovado
  cada vez que solicita la lectura de una foto. El consentimiento se otorga por separado para
  cada Proveedor de IA. El Operador puede retirarlo, dejar de usar la función o borrar sus API
  keys en cualquier momento desde Ajustes.

## 8. Permisos del sistema

| Permiso | Uso | Control del usuario |
|---|---|---|
| Cámara | Solo al pulsar "Encender cámara" en la sección "Importar con IA" | Se puede revocar en Windows: Configuración → Privacidad y seguridad → Cámara |
| Internet (cliente) | Solo para la función de importación con IA | Basta con no configurar la API key o no usar la función |

Las ventanas de la Aplicación tienen bloqueado el acceso a la red. La única conexión externa es la
del proceso interno de la Aplicación hacia el Proveedor de IA, al usar la función de
importación.

## 9. Seguridad de la información

- **Almacenamiento local** en una base de datos dentro de la carpeta de datos de aplicación del
  usuario de Windows.
- **API keys cifradas** con el sistema de protección de datos del propio Windows. Nunca se muestran
  y cada una se envía solo a su Proveedor de IA.
- **Comunicaciones cifradas (HTTPS)** con el Proveedor de IA.
- **Sin servidores del Desarrollador**, lo que elimina el riesgo de filtraciones desde un servidor
  central.

Se recomienda al Operador proteger su equipo con una contraseña de usuario y cifrado de disco
(por ejemplo, BitLocker), y guardar los respaldos en lugares seguros.

## 10. Comunicación de datos a terceros

El Desarrollador **no vende, no arrienda, no cede ni comparte** datos personales con terceros.
Los únicos terceros que pueden recibir datos son:

1. **El Proveedor de IA elegido por el Operador**, solo cuando el Operador usa la función de importación (sección 6).
2. **Microsoft Corporation**, en su calidad de operador de Microsoft Store y de Windows, respecto
   de los datos que Microsoft trate por sí misma según su
   [Declaración de Privacidad](https://www.microsoft.com/en-us/privacy/privacystatement) y la
   configuración de diagnóstico de Windows del usuario. Microsoft puede poner a disposición del
   Desarrollador **informes agregados**, por ejemplo número de instalaciones o informes de fallos
   de la Aplicación, que no identifican directamente a los usuarios.
3. **Servicios de copia de seguridad** que el propio usuario tenga activados (por ejemplo, copias
   de Windows en OneDrive), que pueden incluir los datos de la Aplicación según la configuración
   del usuario.

## 11. Conservación y eliminación

Los datos se conservan en el equipo del Operador hasta que este decida eliminarlos:

- **Versión de Microsoft Store:** al desinstalar la Aplicación, Windows elimina sus datos.
- **Versión con instalador:** después de desinstalar, elimine la carpeta `%APPDATA%\BingoMaster`.
- **API keys:** cada una se puede borrar en cualquier momento desde Ajustes → "Borrar API key", eligiendo el proveedor.
- **Respaldos:** los archivos de respaldo creados por el Operador deben eliminarse por separado.

Las fotografías enviadas al Proveedor de IA se conservan por este conforme a sus propios términos
y políticas (sección 6.2).

## 12. Derechos de los titulares y controles del usuario

### 12.1 Controles disponibles en la Aplicación

- Usar la Aplicación completa sin conexión a internet y sin enviar ningún dato.
- No activar la cámara ni la función de importación con IA.
- Borrar la API key.
- Revisar, corregir o descartar cada lectura antes de guardarla.
- Respaldar, restaurar y eliminar la información.

### 12.2 Derechos

Según la legislación aplicable, entre otras la Ley N° 19.628 sobre Protección de la Vida Privada
y, desde su entrada en vigencia, la Ley N° 21.719 de la República de Chile, así como, cuando
corresponda, el Reglamento General de Protección de Datos de la Unión Europea, los titulares
pueden tener derechos de **acceso, rectificación, supresión (cancelación), oposición,
portabilidad y bloqueo** de sus datos personales, además del derecho a retirar su consentimiento.

Como los datos se almacenan solo en el equipo del Operador:

- **Los Jugadores** deben dirigir sus solicitudes **al Operador** que organiza el bingo, quien
  tiene el control de los datos registrados.
- **Los Operadores** pueden ejercer directamente sus derechos sobre los datos de su equipo con los
  controles de la sección 12.1. Respecto de las fotografías enviadas al Proveedor de IA, deben
  dirigirse a dicho proveedor.
- **Cualquier persona** puede escribir a [contacto@saedo.cl](mailto:contacto@saedo.cl) para
  consultas sobre esta Política. Se responderá dentro de un plazo razonable y, en todo caso,
  dentro de los plazos que exija la ley aplicable.

Si considera que sus derechos no han sido respetados, puede presentar un reclamo ante la
autoridad de protección de datos competente de su país.

## 13. Menores de edad

La Aplicación es una herramienta destinada a organizadores de bingos y **no está dirigida a
menores de edad**. No recopila intencionalmente datos de menores. Si un Operador registrara datos
de un menor, es responsable de contar con la autorización que exija la ley.

## 14. Modificaciones de la Política

El Desarrollador puede actualizar esta Política para reflejar cambios en la Aplicación o en la
normativa. La versión vigente estará siempre disponible en la dirección publicada en la ficha de
Microsoft Store, con su número de versión y fecha de entrada en vigor. Si un cambio amplía de
forma relevante los datos que se transmiten, la Aplicación solicitará nuevamente el
consentimiento del Operador antes de transmitirlos.

## 15. Legislación aplicable

Esta Política se rige por las leyes de la República de Chile, sin perjuicio de los derechos
irrenunciables que la legislación de protección de datos del país de residencia del titular le
reconozca.

## 16. Contacto

Para cualquier consulta, solicitud o reclamo relacionado con esta Política o con el tratamiento de
datos en la Aplicación:

**Sergio Aedo Mena** — [contacto@saedo.cl](mailto:contacto@saedo.cl)
