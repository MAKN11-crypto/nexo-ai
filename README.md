# Bit by Orbit

Bit by Orbit es una app de IA personal, local y multiagente. La interfaz está en español y se adapta a escritorio y móvil. Los chats se ejecutan con un modelo abierto alojado en un motor local compatible con Ollama.

## Lo que ya hace

- Asistente principal y agentes especializados de investigación, desarrollo, estrategia y creatividad.
- Chats independientes por agente; permite crear agentes personalizados.
- Vista de tareas del equipo con historial, estado, aportes de cada especialista, filtros y acceso directo a la conversación; si se interrumpe una respuesta por reiniciar la app, conserva los pasos y permite reintentar.
- Búsqueda en tiempo real por título y contenido de todas las conversaciones guardadas.
- Borradores de habilidades reutilizables: combina el modelo local con fragmentos de búsqueda web, guarda fuentes y exige revisar/activar la habilidad antes de aplicarla a chats relacionados. El propietario es el único que puede aprender, activar o borrar habilidades; el código de propietario se muestra en el anfitrión y permite desbloquear los dispositivos propios. El progreso se sincroniza y se incluye en los respaldos. No modifica los pesos del modelo.
- Espacio **Our AI** con estado del modelo local, recuerdos, habilidades, ejemplos valorados y conversaciones; conserva un historial privado de solicitudes de aprendizaje, borradores, activaciones y errores.
- Conexiones opcionales con Gemini, OpenAI API y Claude API desde la app de escritorio. Las claves se protegen con el almacén cifrado del sistema y no se copian a otros dispositivos. Las APIs pueden tener cobro aparte; las suscripciones de ChatGPT o Claude no cubren su uso.
- Aprendizaje continuo personal del propietario: guarda preferencias expresadas claramente en un perfil privado del anfitrión y recupera pasajes de sus chats en futuras respuestas. Las conversaciones de invitados no se incorporan a ese perfil; el aprendizaje de estilo puede usar respuestas que el propietario calificó.
- Investigación continua opcional del propietario: mientras la app está abierta, revisa por turnos las habilidades activas con búsqueda web y Ollama local, y prepara borradores citados cuando encuentra fuentes nuevas. Solo el propietario decide activarlos. No recorre toda la web ni cambia los pesos del modelo.
- Privacidad entre dispositivos: los invitados solo reciben sus propios chats y las habilidades activas; no pueden consultar chats privados, perfiles o agentes personalizados del propietario, cambiar nodos/modelos ni borrar el espacio compartido.
- Respaldo JSON importable de chats, agentes personalizados y recuerdos; la importación combina chats y omite los repetidos.
- Modo equipo: cuatro especialistas preparan perspectivas y el coordinador las sintetiza.
- Modo equipo distribuido: reparte especialistas entre el nodo principal y los Ollama configurados en otros equipos; comprueba disponibilidad/modelos y muestra dónde trabajó cada agente.
- Respuesta progresiva por streaming y botón para detener generación.
- Conversación por voz en la app: dictado sin conexión cuando el navegador lo admite y respuesta hablada con una voz española instalada localmente. Bit by Orbit no graba ni sube el audio; si falta soporte local, muestra cómo usar el dictado del sistema.
- Procedencia visible por respuesta: identifica el proveedor, el modelo y si el procesamiento fue local; las respuestas externas quedan fuera de la exportación de ejemplos de entrenamiento.
- Protección del anfitrión: una sola generación usa el modelo local a la vez para reducir picos de RAM; hasta tres solicitudes adicionales esperan su turno en vez de fallar. Las solicitudes que excedan la cola se pueden volver a intentar después. Los invitados no pueden descargar modelos ni ver/enviar el enlace de invitación desde el estado de la app.
- Descarga de modelos compatibles desde la biblioteca de la app, con progreso.
- Catálogo con modelos de texto/imagen de 4B, 9B y 27B y un modelo de razonamiento de 14B. El 9B es la opción inicial recomendada; 27B es experimental en 32 GB de RAM.
- Adjuntar hasta cuatro archivos de texto/código por mensaje. El navegador los lee localmente, y su contenido se manda al modelo local como contexto.
- Adjuntar una foto JPG, PNG o WebP por mensaje; se reduce en el dispositivo y se envía a un modelo con visión local compatible.
- Búsqueda web opcional y sin clave mediante DuckDuckGo. Solo se envía la consulta cuando el usuario activa el control; resultados y enlaces se muestran junto con la respuesta.
- Chats y agentes personalizados guardados en el equipo anfitrión y sincronizados entre dispositivos que usen el enlace privado.
- Calificaciones 👍/👎 en las respuestas; las respuestas marcadas se pueden exportar como ejemplos locales para revisar y curar futuras mejoras. No se envían automáticamente a ningún servidor.
- Memoria personal del navegador: recupera fragmentos pertinentes de chats anteriores y guarda recuerdos que el usuario expresa explícitamente. Se puede desactivar, revisar y borrar; no modifica los pesos del modelo.
- Actualizador Electron integrado para consultar un repositorio público de GitHub Releases, descargar en segundo plano y reiniciar para instalar versiones nuevas.
- Enlace de red local protegido con clave aleatoria en cookie HTTPOnly; la clave se guarda en la carpeta privada de datos de la app.
- Los archivos de chats, preferencias, configuración y claves se escriben con permisos privados en sistemas que los soportan.
- Sin claves de API, proveedores de IA de pago, analítica ni fuentes de tipografía externas.
- Cascarón de escritorio Electron para abrir Bit by Orbit como aplicación y usar una carpeta de datos del usuario. Si Ollama ya está instalado, Bit by Orbit intenta iniciarlo.
- Si el motor está listo pero aún no hay modelo, la primera apertura descarga y selecciona automáticamente un modelo apropiado según la memoria detectada.

## Limitaciones actuales

La app requiere Ollama como motor local para **Our AI**. En Windows, la app de escritorio permite instalarlo desde WinGet con un botón; en otros sistemas, ofrece el enlace oficial y una guía de instalación. Bit by Orbit intenta iniciar Ollama al abrirse y permite reintentarlo desde Ajustes. No requiere una cuenta de Ollama. También se pueden conectar APIs externas de forma opcional; su uso puede generar cobros y no aprovecha las suscripciones de ChatGPT o Claude. Cuando Ollama conecta, Bit by Orbit descarga un modelo local; el catálogo incluye análisis de fotos con el modelo adecuado, pero generación de imágenes y videos aún no está integrada.

Los instaladores son específicos de cada sistema: `.exe` para Windows y `.dmg` para Mac Apple Silicon. El paquete de Mac no está firmado ni notarizado, así que macOS puede pedir abrirlo manualmente desde Finder con clic derecho → Abrir. El Galaxy S24 usa la interfaz web adaptable desde el enlace privado de la computadora anfitriona; ambos deben estar en la misma red. Esta versión todavía no publica un APK de Android.

La comunicación entre dispositivos sincroniza el espacio de trabajo desde una computadora anfitriona y reintenta automáticamente después de una desconexión. El modo equipo puede repartir agentes de forma secuencial entre el nodo anfitrión y otros nodos Ollama configurados. Para usar un Ollama en otro equipo, añade su dirección privada en Ajustes y habilita conexiones de red en ese motor; el descubrimiento y emparejamiento automáticos aún no existen. Las conversaciones y el texto de archivos adjuntos se guardan en el anfitrión; comparte el enlace privado únicamente con tus dispositivos. Los invitados pueden tener chats propios sincronizados, pero el servidor filtra la respuesta y las escrituras para que no accedan a chats, memoria o agentes personalizados privados del propietario.

El aprendizaje de habilidades prepara instrucciones reutilizables a partir de búsqueda y conocimiento del modelo, pero no instala ni controla Blender u otros programas y no verifica automáticamente que todos los procedimientos sean correctos.

La memoria automática busca expresiones explícitas de preferencias (“recuerda que…”, “prefiero…”) y recupera preguntas previas por coincidencia local de palabras. El perfil del propietario se guarda en `owner-profile.json`, apartado del espacio compartido, y solo está disponible con la sesión de propietario. La investigación continua consulta fragmentos recientes de búsqueda para una habilidad activa y entrega un borrador con fuentes; está limitada a una habilidad cada pocas horas, requiere conexión y Ollama, y no actualiza los parámetros del modelo. El propietario puede apagarla en Ajustes.

El prototipo no está listo para publicación pública: faltan cuentas de usuario, aislamiento entre clientes, cuotas, cobros, moderación, protección contra abuso, actualizaciones, instaladores firmados y revisión de licencias de cada modelo. El acceso LAN sigue usando HTTP y debe limitarse a una red confiable. La conversación por voz requiere que el navegador ofrezca reconocimiento sin conexión y que el sistema tenga una voz local instalada; no es una llamada telefónica. El modo equipo ejecuta llamadas secuenciales al mismo modelo, no crea capacidad de cómputo adicional. Los modelos abiertos locales no garantizan el nivel de ChatGPT o Claude.

## Desarrollo

Requiere Node.js 22 o posterior. El servidor de desarrollo no necesita paquetes npm:

```sh
npm start
```

Abre `http://localhost:4173`. Para permitir acceso desde otros dispositivos, usa `HOST=0.0.0.0 npm start`; después abre Ajustes y copia uno de los enlaces privados. El servidor crea una clave y exige la cookie de acceso en solicitudes remotas. Mantén el enlace dentro de tu red de confianza; no publiques este prototipo en Internet.

Para la app de escritorio, instala las dependencias del proyecto y usa `npm run desktop`. Los scripts `package:mac`, `package:win` y `package:linux` generan paquetes con electron-builder. Windows produce instalador NSIS y ZIP portable; Mac produce DMG y ZIP para Apple Silicon.

El flujo `.github/workflows/release-windows.yml` compila Windows y Mac cuando cambia la versión de `package.json` en la rama `MAKN10`; también permite publicar manualmente desde GitHub Actions. La versión se convierte en una etiqueta `vX.Y.Z` y se publica como GitHub Release. Los instaladores usan el nombre y el icono de Bit by Orbit. En Windows, Bit by Orbit revisa al abrir, descarga versiones compatibles en segundo plano y permite reiniciar para aplicarlas; si se cierra con una actualización lista, se instala al salir. Los chats y preferencias viven en los datos de usuario y sobreviven a la actualización. El ZIP portable no se autoactualiza. Sin certificados de firma, Windows puede advertir que el editor es desconocido y macOS puede pedir confirmación manual al abrir la app.

## Modelo e inferencia

Bit by Orbit usa la API local de Ollama. La opción sugerida para empezar es `qwen3.5:9b`: acepta texto e imágenes y el catálogo de Ollama indica un tamaño aproximado de 6.6–7.6 GB. La variante `qwen3.5:27b` ocupa alrededor de 17–20 GB y se ofrece como prueba avanzada; puede dejar poco margen de memoria en la MSI. También ofrecemos `qwen3.5:4b` y `qwen3:14b`, de solo texto. El repositorio oficial de Qwen publica Qwen 3.5 9B bajo Apache 2.0; verifica que la variante descargada conserve esa licencia y empaqueta sus avisos antes de distribuirla. Consulta el [catálogo oficial de Qwen 3.5](https://ollama.com/library/qwen3.5) y la [licencia oficial de Qwen 3.5 9B](https://huggingface.co/Qwen/Qwen3.5-9B) antes de publicar un instalador.

La Intel Arc 140V de la MSI es integrada y comparte memoria con el sistema; no equivale a 16 GB de VRAM dedicada. La MSI con 32 GB de RAM es el primer candidato para inferencia, pero el soporte de aceleración y la velocidad deben comprobarse directamente en ese equipo. El MacBook Air M5 con 16 GB puede actuar como cliente y, más adelante, como nodo adicional. El Galaxy S24 funciona como interfaz móvil en esta etapa.

Los modelos se descargan desde el servicio de Ollama y ocupan disco; la app no paga tokens por consultarlos. El uso sigue consumiendo memoria, procesador/GPU, electricidad y ancho de banda durante la descarga.

## Datos locales

- En desarrollo: `.data/` dentro de este directorio.
- En escritorio: carpeta de datos de usuario de Electron.
- En navegador: `localStorage` como copia local y caché de interfaz.
- Borrar conversaciones desde Bit by Orbit elimina las conversaciones compartidas en el anfitrión. Los agentes personalizados se sincronizan aparte.

Los archivos adjuntos se guardan como contexto de la conversación en el espacio de trabajo local. Elige archivos que quieras compartir con el modelo y borra el chat cuando ya no necesites ese contexto. Al activar “Buscar en internet”, la consulta sale del equipo hacia DuckDuckGo; solo ocurre cuando el control está activo.
