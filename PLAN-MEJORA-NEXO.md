# Bit by Orbit: investigación profunda y plan de mejora

Fecha de revisión: 4 de noviembre de 2026. Base del código: Nexo 0.8.0.

## Revisión de producto y construcción — 5 de noviembre de 2026

La revisión de los archivos que componen la interfaz identificó cuatro fricciones que impedían entender el producto: chats y ajustes mezclaban capacidades distintas; “Our AI” no tenía un espacio propio para distinguir el modelo local; los proveedores externos no podían conectarse dentro de la app; y el aprendizaje mostraba una animación de estado temporal, pero no un registro que sobreviviera al cierre. Los agentes también compartían iconos genéricos en lugar de identidades reconocibles.

Esta iteración aborda esos puntos con secciones separadas de Chats, Our AI, Modelos externos y Agentes; un panel de estado del modelo y memoria; aprendizaje exclusivo del propietario con progreso en vivo e historial persistente; claves externas cifradas con el almacén del sistema en la app de escritorio; y cuatro avatares sintéticos distintos con ojos. La ruta local sigue siendo la opción inicial. La guía visible aclara que “aprender” significa guardar recuerdos e instrucciones revisables, no entrenar de forma continua los pesos de la red.

Las APIs de Gemini, OpenAI y Anthropic se conectan por separado, con selección por chat y procedencia visible. Sus APIs requieren claves y pueden cobrar por solicitud; las suscripciones de ChatGPT/Claude no se pueden reutilizar como saldo de API. Solo los mensajes que se envían por esas rutas salen hacia el proveedor seleccionado. La actualización objetivo de esta iteración es `0.11.0`.

Auditoría visual: el capturador de navegador y el escritorio de la app no están disponibles en este entorno, así que los cambios se basan en inspección del código y en las referencias visuales elegidas por el usuario; todavía falta revisar una captura real en Mac y Windows.

### Siguiente trabajo de mayor impacto

1. Panel de tarea durable: plan, subagentes con conversaciones independientes, pasos reanudables, cancelación y permisos por herramienta.
2. Herramientas reales con aprobación visible y una carpeta de trabajo autorizada; primera tarea verificable en Blender.
3. Pairing sencillo de Mac/S24, estado de equipos en tiempo real y acceso remoto seguro mediante VPN o relay autenticado.
4. Mejoras del cerebro: biblioteca de conocimiento con atribución de fuente/fecha, historial editable, exportación y borrado por tema; entrenamiento de pesos solo como proceso separado, evaluado y reversible.
5. Capturas de interfaz y revisión de accesibilidad/responsividad por tamaño de pantalla antes de presentar el instalador como listo para todos.

## 1. Resumen

Nexo ya tiene una app de escritorio en español, una interfaz adaptable a móvil, Ollama local, varios perfiles de agente, modo equipo, búsqueda web manual, adjuntos, chats locales, sincronización LAN, memoria del propietario, borradores de habilidades y revisión continua limitada por tema. Es una base útil para un asistente personal local.

La diferencia principal con MausBot, OpenClaw o Manus no es una pantalla de chat: es el **motor de ejecución**. Nexo todavía no tiene un bucle de agente que elija herramientas, las ejecute con permisos, verifique resultados y recupere tareas. Tampoco usa todavía una cuenta de ChatGPT mediante la integración oficial, Composio, control de escritorio, un navegador agente ni una app compañera nativa.

La meta alcanzable es combinar modelos locales y cuota autorizada de ChatGPT con un runtime local de herramientas. No existe una ruta gratuita e ilimitada para obtener a la vez calidad de frontera, cómputo en la nube permanente, conectores ilimitados y generación ilimitada de video.

## 2. Investigación de productos

| Producto | Modelo y ejecución | Computadora, agentes y apps | Costos y límites que importan |
| --- | --- | --- | --- |
| **OpenMausBot / MausBot** | Aplicación abierta que envuelve motores ya instalados, como Codex o Claude Code; no trae una IA de frontera gratis. | Un bot puede tener modelo, memoria, conversación, herramientas y computadora propios. La app de teléfono acompaña al anfitrión. Tiene un broker de permisos y conectores; Composio simplifica apps. | El anfitrión gratuito debe quedar abierto, encendido y conectado. El producto no incluye el uso del modelo. Su Cloud es un equipo alojado opcional; modelo y computadora son costos distintos. |
| **Manus Desktop / Cue** | La coordinación/planificación principal de Manus depende de su servicio; “My Computer” enlaza el servicio con archivos y comandos locales. | Control desde el teléfono, tareas locales, equipos de agentes y equipos virtuales persistentes. Cue presenta agentes con identidad y computadora propias. | Los créditos de Manus y los equipos virtuales tienen sus propios límites/costos. Ejecutar código en la computadora propia no significa que toda la inteligencia sea local. |
| **OpenClaw** | Gateway autoalojado que conecta modelos de distintos proveedores o modelos propios. | Varios agentes aislados, memorias, herramientas del host, nodos de escritorio y canales de mensajería. | El software puede ser propio; los modelos, hosting, APIs y servicios externos conservan sus precios y límites. Hay que configurar aislamiento y permisos con cuidado. |
| **Claude Cowork / Code** | Usa el plan o proveedor de Anthropic, con sesiones locales y remotas según función. | Puede usar herramientas, apps y computadora local autorizadas; el control remoto permite seguir sesiones desde móvil. | El equipo local debe permanecer activo para tareas locales. La cuota de Claude y las funciones de nube dependen del plan. |
| **Nexo 0.8.0** | Ollama local como único motor de respuesta. | Cinco perfiles, chats por agente y modo equipo secuencial; archivos/fotos como contexto, búsqueda manual y habilidades con revisión. Acceso móvil por navegador dentro de la LAN. | Sin proveedor de inferencia de pago. Requiere Ollama/modelos descargados, energía y RAM. La LAN actual usa HTTP. |

Fuentes: [OpenMausBot README](https://github.com/milind-soni/OpenMausBot), [motores de MausBot](https://docs.openmausbot.com/docs/providers), [instalación y teléfono](https://mausbot.com/download), [MausBot Cloud/precios](https://mausbot.com/pricing), [Cue](https://www.manus.im/blog/introducing-manus-2-0), [Manus My Computer](https://help.manus.im/en/articles/14178443-what-is-the-my-computer-feature-capable-of), [OpenClaw multiagente](https://docs.openclaw.ai/concepts/multi-agent), [Claude Computer Use](https://support.claude.com/en/articles/14128542-let-claude-use-your-computer-in-cowork).

### Qué significa realmente “usar mis créditos de ChatGPT”

OpenAI publicó **Sign in with ChatGPT (SIWC)** para que herramientas de código abierto y ejecución local pidan permiso OAuth y usen solicitudes elegibles contra el plan del propio usuario. La cuota sigue siendo la del plan; se comparte con sus demás apps/uso y el usuario puede poner un límite. SIWC no entrega el historial de ChatGPT, no hace ilimitada la cuota y no autoriza a Nexo a compartir credenciales entre personas. La inferencia va por el endpoint público Responses API, con `store:false` y `stream:true` en ese flujo.

Las condiciones restringen SIWC a un runtime del usuario o uno remoto bajo su control; las credenciales persistentes deben permanecer bajo su control. Además, el usuario debe poder usar la cuota conectada sin pagar o actualizar Nexo. Antes de una versión pública con cobros habrá que separar el servicio comercial y volver a revisar las condiciones vigentes. No reutilizar cookies, automatizar la web de ChatGPT ni eludir límites.

Fuentes oficiales: [SIWC para apps abiertas](https://developers.openai.com/siwc/token-sharing-open-source), [OAuth](https://developers.openai.com/siwc/token-sharing-open-source/sign-in), [modelos y Responses API](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference), [cuota en apps externas](https://help.openai.com/en/articles/20001542-using-your-chatgpt-plan-in-other-apps-and-sites), [términos SIWC](https://openai.com/policies/sign-in-with-chatgpt-terms/).

### Qué resuelve Composio y cuánto cuesta

Composio ofrece conexiones MCP y OAuth a muchas aplicaciones, con herramientas que un agente puede buscar y ejecutar. Reduce el trabajo de escribir un conector por cada producto. Su servicio procesa las autenticaciones/acciones y no es completamente local. El plan gratuito publicado tiene un límite mensual y pausa el uso cuando se alcanza; no es ilimitado. La página publica 100,000 llamadas para ciertas formas de uso, pero los límites varían por modalidad. Las cuentas conectadas también conservan sus propios planes, APIs y funciones premium.

Para la cuenta personal de Miguel, Composio puede ser útil dentro de su límite gratis y con conexiones propias. No debe confundirse con IA gratis, ni se puede financiar un Nexo público compartiendo una cuenta Composio de una sola persona entre todos sus clientes.

Fuentes: [Composio Connect](https://docs.composio.dev/docs/composio-connect), [precios](https://composio.dev/pricing), [autenticación](https://docs.composio.dev/docs/authentication).

### Aprendizaje propio frente a consumo de ChatGPT

La memoria/RAG (recuperar preferencias y pasajes) cambia el contexto, no los pesos del modelo. Un ciclo de habilidades puede investigar un tema, guardar fuentes y proponer una actualización revisable. El entrenamiento de pesos es otra fase: requiere una base autorizada, curación, hardware, evaluación y un rollback de modelo.

No se deben usar respuestas ni resultados de OpenAI como datos o señales para entrenar un modelo destinado a competir con OpenAI. Nexo debe guardar procedencia por respuesta y mantener cualquier corpus de entrenamiento propio separado. Las respuestas producidas por Ollama o datos que el propietario tenga derecho a usar se pueden evaluar para un modelo propio bajo la licencia correspondiente.

Fuente: [Políticas de uso de OpenAI](https://openai.com/policies/usage-policies/).

## 3. Auditoría técnica de la app actual

### Ya está implementado

- Electron con interfaz HTML/CSS/JS y servidor Node local.
- Ollama para texto e imágenes; selección/descarga de varios modelos.
- Perfiles especializados, chats por agente y equipo de especialistas en secuencia.
- Adjuntos de texto e imágenes; búsqueda web manual con resultados citados.
- Memoria explícita, ejemplos calificados, habilidades creadas con fragmentos web y revisión del propietario.
- Revisión web continua de habilidades activas: una propuesta como máximo cada 12 horas por tema; app abierta, Ollama conectado, fuentes nuevas y aprobación del propietario.
- Sincronización LAN, roles de propietario/invitado, importación/exportación y actualizador Electron configurado para GitHub Releases.

### Faltantes grandes frente al producto deseado

1. El modo equipo consulta agentes secuencialmente; no es planificación paralela ni delegación durable.
2. Los perfiles de agente no ejecutan herramientas: no crean archivos, no lanzan Blender, no controlan mouse/teclado ni navegan como agente.
3. No hay adaptador SIWC ni proveedor ChatGPT. Composio tampoco está conectado.
4. La memoria es sencilla y depende del historial cargado; no tiene índices duraderos de documentos, extracción avanzada ni políticas de retención por tipo.
5. Las tareas no sobreviven como jobs recuperables después de cerrar/crashear la app; no hay cola, progreso de largo plazo ni notificaciones push.
6. El S24 abre el sitio por LAN; no existe pairing de teléfono, vista remota en tiempo real ni relay autenticado fuera de casa.
7. HTTP en LAN; el perfil, chats y workspaces se guardan en JSON/localStorage sin cifrado de aplicación. El código de acceso protege la sesión, pero no cifra archivos en disco.
8. Las dependencias del modelo/runtime y los paquetes no son una experiencia “descarga y listo”: actualmente Ollama debe estar instalado; el ZIP portable no autoactualiza como un instalador firmado.
9. La interfaz presenta capacidades aspiracionales de “aprendizaje” y actualizaciones; necesita distinguir de forma visible entre memoria, búsqueda de novedades y entrenamiento real.

## 4. Arquitectura destino

```text
S24 / Mac / MSI
        │ sesiones y estado autenticados
        ▼
Nexo Desktop Hub (MSI o Mac, proceso local)
 ├── Gestor de sesiones, tareas y chats
 ├── Enrutador de modelos: Ollama local | SIWC ChatGPT | proveedores optativos
 ├── Coordinador multiagente y memoria por agente
 ├── Broker de herramientas y aprobaciones
 │    ├── archivos y carpetas autorizadas
 │    ├── navegador aislado
 │    ├── Blender y otros programas por adaptadores
 │    └── MCP/Composio con conexiones por usuario
 ├── Registro local y recuperación de trabajos
 └── Nodos de cómputo confiables en la red propia
```

La MSI sería el anfitrión principal, Ollama sería la opción local, la Mac se uniría como nodo opcional y el S24 sería una app compañera/control remoto. La app puede seguir funcionando sin nube; fuera de casa se necesita VPN propia o un relay. Un relay/VM de nube permanente cuesta recursos y no se cubre con el crédito de ChatGPT.

## 5. Plan épico de mejora

### P0 — Fundamentos para poder usar modelos de frontera

1. **Enrutador de modelos:** interfaz unificada por proveedor; cada mensaje registra proveedor/modelo, latencia, errores y estimación de uso.
2. **SIWC oficial:** botón “Continuar con ChatGPT”, OAuth/PKCE, renovación y revocación, credenciales solo en almacenamiento protegido del equipo, estado de uso/límite y sin compra automática. Respaldo automático a Ollama únicamente con aviso visible.
3. **Controles de gasto:** elegir por bot qué proveedor puede usar, reservar límite de ChatGPT y mostrar qué solicitudes pueden consumir la cuota. Nunca usar la cuenta del propietario para solicitudes de invitados.

### P1 — Agente que de verdad trabaja

4. **Plan y ejecución:** el coordinador descompone tareas, crea subagentes con chats aislados, espera resultados, verifica y resume; permite pausar, reintentar y cancelar.
5. **Broker seguro de herramientas:** permisos por agente y herramienta, carpeta de trabajo explícita, vista previa de cambios, aprobaciones para acciones externas/destructivas y registro recuperable.
6. **Primera tarea vertical:** crear un proyecto 3D en Blender, guardar un `.blend` dentro de carpeta elegida, renderizar un preview y reportar qué creó; requiere Blender instalado o instalador opcional aprobado.
7. **Navegador agente:** perfil separado del navegador personal, lectura y automatización de páginas; contenido web es entrada no confiable y no puede cambiar permisos.

### P2 — Conectores y uso desde el teléfono

8. **Composio MCP opcional:** iniciar con Gmail, Calendar, Drive, GitHub y Notion; OAuth por usuario, permisos mínimos y contador de uso/cuota Composio.
9. **Compañero Android:** pairing QR, notificaciones, lista de tareas, aprobación, chat y vista de progreso. Después portar a iOS/macOS.
10. **Acceso fuera de casa:** primero Tailscale/WireGuard autogestionado; relay propio solo como servicio optativo, autenticación por dispositivo, claves revocables, cifrado y HTTPS.

### P3 — Aprendizaje útil y datos portables

11. **Biblioteca local de conocimiento:** temas elegidos por Miguel, fuentes con URL/fecha/licencia, extracción legal de contenido abierto, deduplicación y búsqueda local. Límites de almacenamiento, ancho de banda y horario; desactivar con un interruptor.
12. **Aprendizaje separado:** preferencias/RAG para personalización inmediata; evaluación de respuestas de Ollama con correcciones; dataset propio solo de procedencia permitida; entrenamiento offline opcional, prueba antes/después y rollback. Nunca usar respuestas OpenAI para entrenar el modelo competidor.
13. **Memoria auditable:** ver qué aprendió, de dónde, cuándo, por qué se usa, borrar/editar/exportar un recuerdo y olvidar un tema completo.

### P4 — Distribución pública y negocio

14. Instaladores firmados para Windows/macOS/Linux, runtime opcional gestionado, migraciones con backup y actualización dentro de la app.
15. Aislamiento de usuarios, cuentas y sincronización cifrada; consentimiento y eliminación de datos; observabilidad sin recopilar conversaciones por defecto.
16. Servicio de nube con precio y límites claros, separado de la cuota ChatGPT de cada persona; prueba de carga y economía unitaria antes de prometer acceso público.
17. Benchmarks publicados de velocidad/calidad/errores para las máquinas MSI, Mac y un set de modelos; no prometer paridad hasta medirla.

### Criterios para declarar cada bloque terminado

- SIWC: autorizar, pedir respuesta, alcanzar límite, revocar y reiniciar; ningún token en navegador, sincronización o logs.
- Herramientas: cada acción muestra agente, objetivo, entradas, cambios previstos y resultado; cancelación funciona; invitado no hereda permisos del propietario.
- Aprendizaje: la fuente se abre, queda atribuida, el borrador no se activa sin aprobación y borrar el tema elimina sus fragmentos/index.
- Remoto: vincular y revocar un móvil, recuperar tras pérdida de red, HTTPS/VPN documentados y prueba desde otra red.
- Público: datos entre usuarios aislados, proceso de borrado probado, instaladores firmados y costos medidos por usuario.

## 6. Límites de “gratis”

- **Sin pago al proveedor:** Ollama y los modelos abiertos descargados; el precio es energía, disco, calor y tiempo de la computadora.
- **Incluido con suscripción:** cuota SIWC de ChatGPT, solo si la cuenta/plan cumple requisitos y nunca más allá de sus límites salvo que el usuario active créditos.
- **Gratis con tope:** Composio Free y otros servicios externos; pausa al llegar a la cuota y sus servicios conectados pueden cobrar.
- **No gratis ilimitado:** VM de nube, almacenamiento, relay, inferencia siempre encendida, generación ilimitada de video y servicio público masivo.

## 7. Situación visual

La interfaz actual se puede evaluar leyendo los archivos de frontend, pero no logré conectar el capturador Browser de esta sesión. Por eso este documento es una auditoría técnica y de producto, no una auditoría visual con evidencia de pantalla. No incluyo imágenes inventadas como si fueran capturas reales.

## 8. Registro de construcción

### Base completada en la primera iteración

- Cada respuesta nueva incluye proveedor, modelo y si la inferencia ocurrió localmente; la etiqueta queda guardada dentro del mensaje y se muestra bajo la respuesta.
- El estado de Nexo expone el proveedor actual (`ollama`) como dato estructurado para construir el enrutador común.
- La exportación de ejemplos de aprendizaje excluye respuestas marcadas con proveedores externos y conserva la procedencia/modelo de las respuestas locales exportadas.
- Las invitaciones y nodos privados ya no se devuelven en el estado de un invitado; solo el propietario recibe los enlaces que contienen la clave de acceso.
- Descargar modelos requiere sesión de propietario. El anfitrión limita Ollama a una inferencia activa para reducir el riesgo de quedarse sin memoria.
- Los archivos privados del espacio se guardan atómicamente con permisos restringidos; al leer datos ya existentes se corrige su modo en sistemas compatibles.
- El modo de voz en la app usa reconocimiento sin conexión cuando el navegador lo ofrece y una voz local instalada; no manda audio fuera del equipo. Si falta esa capacidad, explica cómo usar el dictado del sistema.
- `ARCHITECTURE.md` define el contrato del enrutador, la ruta de SIWC y la separación entre memoria, evaluación y entrenamiento.

### Hallazgos de la segunda revisión

1. `/api/status` incluía enlaces de invitación y direcciones privadas para usuarios invitados. Ahora esa información queda reservada al propietario.
2. La descarga de modelos no comprobaba rol de propietario. Ahora rechaza invitados y desactiva sus controles en la interfaz.
3. La procedencia del proveedor no se conservaba al sincronizar el espacio. Ahora se valida y persiste para que no se pierda al reabrir o compartir chats.
4. Los archivos de chats y preferencias podían heredar permisos amplios. Las nuevas escrituras usan reemplazo atómico y permisos privados; los archivos existentes se corrigen al leerlos cuando el sistema lo permite.
5. Varias consultas locales podían solaparse y elevar el consumo de RAM. El servidor limita chats simultáneos y evita solapar inferencias de Ollama.
6. La actualización automática no estaba configurada y no se instalaba al cerrar. Ahora se instala al salir cuando ya terminó la descarga y mantiene los datos de usuario; falta publicar Nexo en un repositorio y distribuir un instalador compatible.
7. No existía una interfaz de conversación por voz. Se añadió dictado solo con reconocimiento local y respuesta hablada solo con voces instaladas localmente; no equivale a una llamada telefónica y depende del soporte del navegador/sistema.
8. La publicación dependía de configurar manualmente el repositorio. Se preparó un flujo de GitHub Actions para Windows que incrusta el repositorio en el instalador, comprueba que la etiqueta coincide con `package.json`, crea NSIS/ZIP/`latest.yml` y publica una Release. Falta seleccionar o crear el repositorio público y publicar la primera versión; no hay autenticación válida desde el terminal y no se eligió cuál de las dos cuentas GitHub usar.

Queda pendiente una auditoría automatizada de seguridad y una revisión con capturas de pantalla; sus herramientas no están disponibles en esta sesión.

### Orden de implementación siguiente

1. Unificar adaptadores de modelos con streaming, cancelación, capacidades, procedencia y errores tipados.
2. Completar conexión opcional mediante un protocolo permitido y almacenamiento local protegido; mantener Ollama sin cambios como ruta gratuita predeterminada.
3. Hacer persistentes los trabajos de agentes: plan, pasos, reintentos, cancelación y recuperación tras cerrar la app.
4. Añadir broker de herramientas con carpetas permitidas y aprobación antes de modificar archivos o abrir programas.
5. Probar la primera tarea real de Blender en la MSI y añadir emparejamiento de Mac/S24.
6. Preparar firma y empaquetado para la instalación de escritorio; antes de cobrar por una edición pública, revisar licencias y términos del proveedor de cada integración.

El SDK publicado `openai/sign-in-with-chatgpt-devkit` declara una licencia no comercial. Nexo no reutilizará ese código mientras el objetivo incluya distribuir una versión de pago. El protocolo público y los términos del servicio deben revisarse por separado antes de activar esa integración comercial.
