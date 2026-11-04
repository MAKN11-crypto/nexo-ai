# Nexo: arquitectura y ruta

## Objetivo del producto

Una app de escritorio y móvil que permita conversar con un asistente coordinador, abrir chats con agentes especializados, hacer que colaboren y usar modelos abiertos en equipos propios. La cuenta del creador podría usar el producto sin cobro; un futuro servicio público tendría que financiar cómputo con suscripciones u otros ingresos.

## Componentes actuales

1. **Interfaz:** HTML/CSS/JS adaptable dentro de Electron o un navegador local. El S24 puede abrir el anfitrión desde la LAN.
2. **Anfitrión local:** servidor Node.js para API, acceso con clave de red, sincronización de chats, configuración y descarga de modelos.
3. **Motor de inferencia:** adaptador Ollama local o hacia una IP privada. No admite APIs de inferencia públicas.
4. **Agentes:** instrucciones especializadas y chats por separado. El modo equipo consulta a cuatro especialistas en secuencia, pasando los aportes anteriores, y pide una síntesis final.
5. **Datos:** conversaciones, contexto de documentos e imágenes se guardan en el equipo anfitrión y en la copia local del navegador.
6. **Procedencia de respuestas:** cada respuesta nueva registra proveedor, modelo y si se procesó localmente. Esta etiqueta se conserva con el chat; el exportador de ejemplos solo admite respuestas locales.

## Decisiones para el hardware actual

- MSI: primera candidata a anfitriona e inferencia por sus 32 GB de RAM.
- MacBook Air M5: cliente y entorno posterior para probar otro runtime/modelo.
- Galaxy S24: cliente móvil.
- Primera prueba sugerida: Qwen 3.5 9B para texto e imágenes en la MSI; Qwen 3.5 4B si se prefiere menos memoria y más velocidad.
- Ajuste de contexto actual: 8,192 tokens para evitar que un contexto máximo muy grande consuma memoria innecesariamente.
- La Intel Arc 140V comparte la RAM del sistema. Se debe medir la inferencia real en Windows; el nombre de GPU no garantiza aceleración compatible.

## Ruta técnica

### Siguiente bloque de construcción: base multi-proveedor y trazabilidad

- Mantener un contrato común para generación en streaming, cancelación, errores por cuota, metadatos de proveedor y capacidades (texto, imágenes y herramientas).
- Conservar Ollama como proveedor predeterminado; la selección de otro proveedor debe ser explícita por chat y visible en cada respuesta.
- Investigar SIWC con el protocolo documentado, sin reutilizar el repositorio `openai/sign-in-with-chatgpt-devkit`: su licencia es no comercial y no encaja con el objetivo de distribuir Nexo como producto de pago. No guardar secretos en la interfaz ni sincronizarlos entre equipos.
- Antes de incluir SIWC en una edición comercial, comprobar que el uso del servicio y sus términos permiten ese modelo de distribución; si no, ofrecer conexión local Ollama y proveedores con credenciales propias.
- No usar respuestas de proveedores externos para entrenar un modelo que compita con ellos. Mantener separadas memoria/RAG, evaluaciones de respuestas locales y cualquier futuro corpus de entrenamiento.

La primera parte de este bloque ya está implementada: respuestas locales recientes llevan procedencia `ollama` y el exportador de ejemplos excluye cualquier respuesta marcada con otro proveedor.

### Endurecimiento aplicado a la app personal

- El estado de `/api/status` ya no entrega a invitados la clave de invitación, las direcciones de nodos ni los ajustes del anfitrión.
- La descarga de modelos requiere propietario y Nexo limita a una generación local activa para proteger la memoria del equipo.
- La procedencia se conserva al sincronizar o respaldar chats.
- El espacio, el perfil y la configuración se escriben con archivos temporales atómicos y permisos privados cuando el sistema operativo lo permite.

Esto mejora el uso dentro de una red de confianza, pero no reemplaza HTTPS, cuentas por persona, aislamiento multiusuario, límites de abuso ni una auditoría formal antes de abrir el servicio a Internet.

### Etapa A — prototipo personal

- Reemplazar Ollama como requisito externo por un runtime integrado y firmado por sistema operativo.
- Detectar hardware, instalar/abrir motor y modelo desde el primer arranque, con progreso y opción de cancelar.
- Abrir la app en MSI como anfitriona; el Mac y el celular se emparejan desde un enlace/QR local.
- Probar velocidad, memoria, temperatura, imágenes y recuperación tras reinicio en hardware real.

### Etapa B — multi-computadora

- Añadir emparejamiento de nodos, descubrimiento en LAN, autenticación mutua y mensajes firmados.
- Registrar memoria libre, modelo instalado, carga y capacidades de cada nodo.
- Asignar tareas explícitas al nodo adecuado, con cola, cancelación, reintentos y límites de uso.
- Enviar a otro nodo solo el texto/archivo necesario; mostrar en la interfaz qué equipo procesa cada tarea.
- El modo equipo debe poder paralelizarse cuando haya varios nodos. Hoy sus consultas son secuenciales.

### Etapa C — funciones de agente

- Herramientas con permisos: buscar en web, leer archivos seleccionados, crear/editar archivos en una carpeta autorizada, ejecutar código aislado y crear medios localmente.
- Vista de plan, aprobación de acciones, registro de resultados y recuperación de errores.
- Memoria por agente configurable y búsqueda local en documentos.
- Límites separados para acciones de solo lectura y acciones que cambian archivos/sistema.

### Etapa D — publicación comercial

- Separar el producto local y la oferta alojada.
- Añadir cuentas, datos aislados por usuario, pagos, cuotas, monitoreo, soporte y eliminación/exportación de datos.
- Un servicio central necesita servidores de inferencia; escalarlo cuesta dinero. Las suscripciones deben cubrir ese costo antes de prometer uso ilimitado.
- Preparar firma, actualización automática, instaladores por arquitectura, aviso de privacidad, términos y revisión de licencias de motores, modelos y medios.
- Entrenar un modelo base propio es una etapa aparte; primero se valida el producto con modelos abiertos y, más adelante, ingresos.

## Límites y seguridad

- Este servidor no está diseñado para exposición pública ni para usuarios desconocidos.
- El acceso LAN usa clave privada, pero no TLS; la red debe ser de confianza.
- Los adjuntos se entregan al modelo local elegido y se conservan como parte del chat en el anfitrión.
- Los agentes de esta versión solo generan respuestas. No ejecutan comandos, navegan la web ni modifican archivos.
- Los modelos locales pueden ser útiles, pero su calidad y velocidad dependen del hardware y quedan por debajo de muchos servicios de frontera.
- No se deben prometer generación de video ni uso ilimitado con calidad de frontera hasta tener motor y hardware que lo sostengan.
