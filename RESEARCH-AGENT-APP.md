# Investigación: Nexo como asistente de computadora

Actualizado: 4 de noviembre de 2026.

## Lo que hace MausBot

OpenMausBot (MausBot) es una aplicación abierta de escritorio que presenta varios agentes como una conversación. La app no trae un modelo propio de nivel ChatGPT: inicia motores que el usuario ya instaló y autorizó, como Codex o Claude Code. Cada bot puede tener su modelo, conversación, memoria, herramientas y equipo de trabajo. El teléfono funciona como control remoto del anfitrión; en el modo gratuito el anfitrión debe permanecer abierto, encendido y conectado a internet. La app en sí no incluye el uso de modelos y la nube de MausBot es un extra independiente.

Su valor principal es el “harness”: el administrador local que conecta el modelo con archivos, terminal, navegador, aplicaciones, permisos y agentes. El motor del modelo puede cambiar sin reconstruir todo el producto. Los permisos se pueden asignar por bot y las acciones generan solicitudes/registro. Una máquina de nube aislada es una opción para tareas separadas; cuesta y no reemplaza el modelo.

Fuentes: [OpenMausBot README](https://github.com/milind-soni/OpenMausBot), [documentación de motores](https://docs.openmausbot.com/docs/providers), [descarga y modo teléfono](https://mausbot.com/download), [precios y uso de IA](https://mausbot.com/pricing).

## Qué aportan los otros productos

| Producto | Idea aprovechable para Nexo | Qué implica |
| --- | --- | --- |
| Manus Desktop / Cue | Controlar la computadora desde el teléfono, asignar tareas a un equipo de agentes y trabajar con archivos y apps locales. | “Usar mi computadora” no significa que toda la IA sea local: Manus explica que la planificación sigue dependiendo de su servicio en la nube. El ordenador debe estar disponible para el control local; una computadora de nube es otro recurso. |
| Claude Cowork / Code | Sesiones locales con archivos, herramientas autorizadas y control remoto; el equipo debe seguir despierto y con la app activa. | La capacidad y el consumo dependen del plan de Claude. |
| OpenClaw | Gateway propio, agentes con espacios/memorias separados y muchos canales de mensajería. | Más flexible, pero la exposición de una herramienta que ejecuta comandos requiere límites, aislamiento y permisos explícitos. |
| Nexo actual | Interfaz en español, Ollama local, varios roles, modo equipo, sincronización LAN, memoria y habilidades del propietario. | Aún no tiene un ciclo general de herramientas, control de escritorio, agente de navegador, conexión de modelos ChatGPT ni canal remoto seguro fuera de la red local. Sus roles no equivalen todavía a agentes que ejecutan tareas con herramientas. |

Fuentes primarias: [Cue y equipos de agentes](https://www.manus.im/blog/introducing-manus-2-0), [Manus My Computer](https://help.manus.im/en/articles/14178443-what-is-the-my-computer-feature-capable-of), [control de computadora de Claude](https://support.claude.com/en/articles/14128542-let-claude-use-your-computer-in-cowork), [multiagente de OpenClaw](https://docs.openclaw.ai/concepts/multi-agent).

## Usar la cuota de ChatGPT en Nexo

Hay una ruta oficial reciente: **Sign in with ChatGPT (SIWC)** ofrece a clientes de código abierto un flujo de autorización OAuth para que el usuario autorice solicitudes elegibles de su plan ChatGPT. Nexo pediría permiso en una ventana oficial, mantendría las credenciales en el equipo del usuario y haría las peticiones al endpoint público Responses API. El flujo requiere identificador de cliente asignado por OpenAI, identificador local del anfitrión, PKCE, validación de identidad, gestión de renovación y tratamiento correcto de los límites. No se debe copiar la cookie del navegador ni imitar endpoints privados de ChatGPT.

La persona puede elegir si concede el uso del plan y fijar un límite para la app en **ChatGPT → Ajustes → Uso**. El uso se descuenta de la cuota existente y comparte límites del plan; no añade capacidad ni garantiza uso ilimitado. Si se agota, Nexo debe detener la petición y ofrecer el modelo local. No compra créditos ni cambia a un proveedor de pago en silencio.

Esto encaja con un cliente que corre localmente. Los términos SIWC exigen que las solicitudes vengan del runtime local del usuario o de un runtime remoto bajo su control, que la autorización sea individual y que no se compartan ni revendan tokens/cuotas. Para uso de la cuota ChatGPT, la app no puede cobrar al usuario ni exigir una versión de pago. Esto condiciona la futura versión pública: podremos cobrar por servicios separados solo con una separación contractual y técnica que respete esas condiciones; hay que revalidar las reglas antes de publicar.

Fuentes oficiales: [SIWC para clientes de código abierto](https://developers.openai.com/siwc/token-sharing-open-source), [flujo de registro y OAuth](https://developers.openai.com/siwc/token-sharing-open-source/sign-in), [modelos y peticiones](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference), [uso en otras apps](https://help.openai.com/en/articles/20001542-using-your-chatgpt-plan-in-other-apps-and-sites), [términos SIWC](https://openai.com/policies/sign-in-with-chatgpt-terms/).

## Separar “usar ChatGPT” de “mejorar nuestra IA”

Nexo puede aprender preferencias y recuperar recuerdos autorizados localmente. Eso personaliza respuestas, pero no cambia los pesos de Qwen ni crea una superinteligencia. También puede recopilar correcciones y ejemplos generados por el modelo local con consentimiento, para evaluar o afinar un modelo compatible.

No debemos guardar, exportar, seleccionar ni usar respuestas de OpenAI como material o señales para entrenar un modelo que compita con OpenAI. Las reglas actuales prohíben usar modelos o resultados de OpenAI para preparar o suministrar material de entrenamiento para alternativas. Por tanto, cada mensaje debe conservar la procedencia del modelo; el corpus de entrenamiento propio debe excluir las respuestas de ChatGPT. La memoria contextual de la experiencia del usuario queda separada del entrenamiento de pesos.

Fuente: [Políticas de uso de OpenAI](https://openai.com/policies/usage-policies/).

## Composio y el “todo gratis”

Composio funciona como una capa de integración y autenticación: MCP conecta agentes a herramientas de Gmail, Notion, Slack, GitHub y otras apps; el usuario autoriza cada cuenta por OAuth. Es una forma rápida de conseguir muchas conexiones, aunque los tokens y datos de las acciones pasan por el servicio de Composio, así que no es completamente local.

Su plan Free publicado actualmente incluye una cuota mensual de llamadas (la página de precios indica 100,000 para ciertos modos de integración), sin tarjeta y con tope estricto; al agotarla, las acciones se pausan hasta el siguiente mes o un cambio de plan. No se debe prometer esa cantidad para todos los métodos: el límite depende de si se usa una app OAuth administrada por Composio o credenciales propias. Cada servicio conectado también puede exigir una cuenta propia, tener límites, o cobrar funciones premium. Composio puede servir en la etapa personal sin costo monetario dentro de la cuota, pero no es ilimitado ni garantiza que toda acción de terceros sea gratis.

Para Nexo: probar primero Composio MCP como conector opcional y por cuenta del propietario; enviar solo las herramientas necesarias a cada agente. Para una futura versión pública, no usar una cuenta Composio compartida entre usuarios: cada usuario tendría que autorizar su propia conexión o Nexo tendría que asumir el costo del proveedor.

Fuentes: [Composio Connect](https://docs.composio.dev/docs/composio-connect), [precios Free](https://composio.dev/pricing), [autenticación y conexiones](https://docs.composio.dev/docs/authentication).

## Arquitectura recomendada para Nexo

1. **Anfitrión local:** Nexo Hub se ejecuta en la MSI y mantiene bots, historial, permisos y cola de tareas. Continúa usando Ollama para trabajo sin conexión o sin cuota.
2. **Adaptadores de modelos:** cada bot elige Nexo Local (Ollama) o ChatGPT (SIWC); agregar otro proveedor no cambia el sistema de herramientas. El proveedor/modelo usado se registra en cada respuesta.
3. **Agentes reales:** coordinador, investigación, archivos/código, navegador y creatividad tienen chats, contexto y permisos independientes. El coordinador crea tareas hijas, las sigue, reúne resultados y reporta qué hizo.
4. **Herramientas locales:** primero archivos dentro de carpetas elegidas, navegador aislado y ejecución de programas mediante adaptadores concretos (por ejemplo Blender). Empezar sin terminal irrestricta ni permisos de administrador.
5. **Conectores externos:** añadir Composio como conexión MCP optativa, con autorización por propietario, scopes limitados y una cuota visible; los límites o cargos de cada servicio conectado permanecen separados.
6. **Centro de permisos:** cada agente recibe solo las herramientas autorizadas. Vista previa y registro por acción. Solicitar aprobación para borrar/sobrescribir, instalar programas, usar cuentas externas, enviar mensajes o realizar compras. Permitir aprobación permanente solo para una herramienta y carpeta acotadas.
7. **Control remoto:** la app de escritorio ejecuta el trabajo; el S24 muestra estado, resultado, permisos y vista de actividad. En casa se puede usar la red local. Fuera de casa se necesita un túnel autenticado o un relé. Una conexión pública segura no se consigue exponiendo el puerto actual.
8. **Tres equipos:** la MSI puede alojar el runtime y Ollama; la Mac puede ser nodo local para tareas/modelos compatibles; el S24 es cliente remoto. Cualquier proceso depende de que el equipo anfitrión permanezca disponible.
9. **Nube optativa:** usar servicios propios solo para coordinación, sincronización cifrada o relé. Una computadora de nube siempre encendida cuesta cómputo/almacenamiento y no puede financiarse con “créditos ilimitados”. La primera versión no requiere nube: funciona dentro de casa y la MSI ejecuta las tareas.
10. **Aprendizaje propio permitido:** las preferencias y recuerdos siguen privados del propietario; entrenamiento futuro usa datos propios, datos abiertos con licencia apropiada y ejemplos del modelo local. Revisar/eliminar/exportar, con consentimiento y procedencia visibles.

## Orden de construcción

1. Motor de agentes con proveedor intercambiable y streaming; mantener Ollama funcionando mientras se añade SIWC oficial.
2. Implementar y verificar login SIWC, estado de cuota, renovación y botón para desconectar; nunca persistir tokens en `localStorage` ni sincronizarlos al teléfono.
3. Harness de herramientas con permisos y registro, empezando por carpeta de trabajo, comandos de bajo riesgo y aplicación Blender como primer flujo vertical.
4. Integración MCP con Composio para las apps elegidas, sin asumir cuota ilimitada ni reutilizar credenciales de varias personas.
5. App móvil compañera/pairing para S24, luego transmisión de eventos y control remoto autenticado; priorizar VPN/local antes de túneles de nube.
6. Aislamiento real de bots, tareas duraderas, recuperación tras reinicio, notificaciones y varios agentes en paralelo.
7. Recién después, preparar distribución pública, autoactualización firmada, política de privacidad, términos y opción de nube independiente. No anunciar paridad con ChatGPT/Claude hasta medir resultados en tareas reales.

## Decisión

La meta viable es un **asistente local con acceso opcional a la potencia y cuota que ya pagas**, con herramientas y permisos en tu computadora. No es viable prometer inteligencia de ChatGPT gratis e ilimitada con las máquinas disponibles: el modelo local será útil, el plan ChatGPT tendrá sus topes, y la nube tendrá su propio costo. Nexo puede unir ambos sin que los datos de una fuente se mezclen indebidamente con el entrenamiento de la otra.
