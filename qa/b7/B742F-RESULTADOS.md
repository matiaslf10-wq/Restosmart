# B7.42F — Corrección local de accesos cliente

Fecha: 2026-10-25. Base inspeccionada: `40a4230`, rama `release/restosmart-v0.9-pro-pilot`.

## Alcance y contratos inspeccionados

Se inspeccionaron las cuatro pantallas solicitadas, `/api/productos`, `/api/productos/[id]`, su endpoint de disponibilidad, `/api/pedidos`, `/api/admin/mesas`, `adminAuth`, `authorizedAdminAccess`, `adminAccess`, `supabaseAdmin` y las capacidades de planes.

- El QR de mesa identifica un **número de mesa dentro de una sucursal**, no un ID global. El pedido usa el ID SQL que devuelve esa resolución.
- Productos son filas globales relacionadas mediante `producto_restaurantes`; las marcas pertenecen a un tenant. No se inventó una columna tenant en productos.
- La identidad administrativa proviene de cookie firmada y se revalida contra `admin_users`; la sucursal se valida contra `restaurants.owner_tenant_id`. Los parámetros cliente son selectores sujetos a autorización, no evidencia de pertenencia. Se conserva el modelo administrativo existente de acceso al tenant; no se inventaron roles ni asignaciones individuales por sucursal.
- `/api/pedidos` ya valida la mesa dentro del restaurante y resuelve mesas virtuales por sucursal. No se modificó su contrato ni su implementación.
- Marcas, categorías y restaurantes del panel ya se consultaban mediante APIs. Las lecturas SQL restantes en estas cuatro pantallas eran las mesas, el contexto de `/pedir` y las imágenes de productos. También había escrituras directas de portada/productos, metadatos de imágenes y Storage.

## Archivos cambiados

| Archivo | Cambio |
| --- | --- |
| `app/mesa/[mesaId]/page.tsx` | Ambas lecturas de mesa pasan por API pública mínima. |
| `app/pedir/page.tsx` | Contexto del local por API; productos y contexto se cargan en paralelo. Se elimina import del cliente Supabase. |
| `app/admin/productos/page.tsx` | Listado administrativo, lectura y portada por APIs; desaparecen SQL y Storage directos. Subida deshabilitada y error de eliminación mostrado al usuario. |
| `app/admin/marcas/page.tsx` | Subida directa de logo retirada y control deshabilitado con aviso; edición de los otros campos conservada. |
| `app/api/public/contexto/route.ts` | GET de configuración comercial y marcas activas del tenant derivado del restaurante; no devuelve propietario, plan ni datos administrativos. |
| `app/api/public/mesa/route.ts` | GET de una mesa por restaurante y número positivo; solo id, número, nombre y restaurante. Rechaza mesa virtual, sucursal ausente/pausada/cerrada y modo takeaway. |
| `lib/publicOrderingContext.ts` | Selección explícita de sucursal, sin fallback global; configuración filtrada por restaurante y tenant derivado en servidor. |
| `app/api/admin/productos/route.ts` | GET autenticado y autorizado; productos y configuración de la sucursal autorizada, incluidos vínculos no visibles. Respuesta de array conservada. |
| `app/api/admin/productos/[id]/imagenes/route.ts` | GET y PUT autenticados; producto vinculado a la sucursal, marca del tenant e imagen del producto. Portada usa URL almacenada. POST autorizado devuelve 409 por bloqueo de subida. |
| `lib/adminProductAccess.ts` | Validación compartida de producto/sucursal/marca y rechazo de productos vinculados a sucursales de tenants distintos o inexistentes. |
| `app/api/productos/route.ts` | Lectura pública exige sucursal disponible y devuelve configuración de esa sucursal sin consultar/enriquecer vínculos ajenos. POST valida sucursales antes del INSERT y responde 403 si no están autorizadas. |
| `app/api/productos/[id]/route.ts` | PUT/DELETE usan la pertenencia estricta compartida. DELETE con imágenes devuelve 409 antes de escribir. |
| `app/api/productos/[id]/disponible/route.ts` | Botón de disponibilidad usa la misma validación estricta. |
| `qa/b7/b742f-access-local.mjs` | Pruebas locales de autorización y aislamiento de aplicación. |
| `qa/b7/B742F-RESULTADOS.md` | Este informe. |

`lib/adminAuth.ts`, `lib/authorizedAdminAccess.ts`, `lib/supabaseAdmin.ts`, `/api/admin/mesas` y `/api/pedidos` se inspeccionaron sin modificarse. No se cambiaron billing, checkout ni webhooks.

## Storage: bloqueo deliberado y limitación exacta

Las rutas heredadas eran `productoId/fecha-nombre.ext` y `marcas/fecha-nombre.ext`. Las escrituras se hacían desde navegador con el cliente público; la sesión del panel es una cookie propia, no demuestra una sesión de Supabase Storage. El código no garantizaba tenant en ruta, validación de contenido real/MIME, límite de tamaño ni asociación de objetos de marcas a una identidad persistida. La extensión venía del nombre del archivo.

Por ello no se habilitó un reemplazo privilegiado que aceptara esas rutas del cliente:

- Subir fotos y logos queda bloqueado en UI; la función de respaldo también rechaza la operación. El POST de imágenes exige autorización y luego devuelve 409 sin escritura.
- No existe una nueva operación de borrado de objetos ni de metadatos de imágenes. Se retiró el borrado directo previo del navegador.
- Un producto con filas en `producto_imagenes` no se elimina: respuesta 409 y mensaje visible. Así se preservan objetos y metadatos mientras no haya limpieza segura. Los productos sin esas filas mantienen DELETE administrativo; una imagen histórica solo por URL no provoca borrado físico.
- Ver imágenes existentes, elegir portada y quitar la referencia de logo del formulario siguen disponibles. Quitar una referencia no borra el archivo.
- No se expuso service_role al cliente ni se publicaron escrituras de Storage. El cliente privilegiado existente sigue en módulos de servidor.

Para desbloquear se necesita definir y verificar localmente un contrato de objetos por tenant/sucursal/producto o marca, migración de rutas heredadas, MIME por contenido, tamaño máximo, control de pertenencia e identidad y compensación/atomicidad entre objeto y metadatos. No se inspeccionaron políticas reales ni configuración de bucket; no se presupone que sus permisos actuales sean seguros. Retirar llamadas de la UI no revoca permisos remotos existentes.

## Pruebas realmente ejecutadas

- `npx tsc --noEmit`: el wrapper PowerShell `npx.ps1` fue rechazado por la política de firma. Se ejecutó `npx.cmd tsc --noEmit` correctamente (exit 0). También pasó `node node_modules/typescript/bin/tsc --noEmit`. La validación final `npx.cmd --no-install tsc --noEmit` pasó con exit 0, sin instalar dependencias.
- `node --test qa/b7/b742f-access-local.mjs qa/b7/b720e-security-local.mjs`: **30/30 aprobadas**, exit 0 (18 nuevas y 12 existentes).
- La suite nueva ejecuta los handlers y los helpers reales de autorización/sesión/pertenencia con consultas en memoria y resolución de capacidades sustituida. Usa una clave efímera de prueba en el contexto aislado, sin leer `.env`, sin importar el cliente Supabase real y sin red. Comprueba ausencia de escrituras ante rechazo, no solo el status.
- Cobertura: cookie alterada; sin sesión; tenant ajeno; sucursal ajena; otra sucursal del mismo tenant sin vínculo; producto ajeno; imagen ajena; producto compartido entre tenants; portada autorizada usando URL almacenada; listado administrativo aislado; acceso público permitido; mesa virtual/pausada/takeaway denegada; POST/PUT/DELETE de productos públicos prohibidos; subida bloqueada; DELETE con imágenes bloqueado; campos mínimos y ausencia de cliente SQL/Storage en las cuatro pantallas.
- Los endpoints públicos solo exportan GET: la suite verifica ausencia de handlers de mutación. El HTTP 405 efectivo de Next no se ejercitó mediante servidor.
- `git diff --check`: aprobado, exit 0. Git informa avisos de normalización LF/CRLF en Windows, sin errores de whitespace.

Estas pruebas con dobles verifican lógica de aplicación. **No certifican seguridad de DB, RLS, grants ni Storage.** La primera ejecución de la suite nueva falló por interoperabilidad de import de crypto en el cargador de pruebas; se corrigió `esModuleInterop` del cargador y las pasadas posteriores fueron correctas.

## Riesgos y pruebas pendientes

1. No se conectó Supabase remoto ni se ejecutó SQL. No hay validación real de esquema, constraints, FK/cascadas, políticas, grants, buckets o exposición de Data API. Este cambio prepara el cierre; no autoriza declarar terminado el cierre SQL.
2. Las operaciones existentes de creación/sincronización de producto y la portada usan varias consultas, sin transacción. La validación previa evita inserción con sucursales ajenas, pero un error posterior puede dejar estado parcial. La portada actualiza URL y flags en consultas separadas: concurrencia/fallo puede requerir reintento. No se inventó una RPC SQL bajo estas restricciones.
3. Las comprobaciones de propiedad y escrituras son consultas separadas: falta validar concurrencia con DB real y defensa adicional en DB. Productos son globales: cambios de nombre, precio, portada o disponibilidad afectan sus sucursales del mismo tenant según el modelo existente; no se introdujo disponibilidad global por sucursal.
4. Las marcas se comparten a nivel tenant, como en el contrato previo. La configuración comercial es por sucursal. No existe en los archivos inspeccionados un contrato de marcas asignadas individualmente a sucursal, por lo que no se inventó uno.
5. Sucursales sin `owner_tenant_id` quedan bloqueadas en lectura pública en lugar de recurrir al slug como propietario. Menús públicos de sucursales pausadas/cerradas también quedan bloqueados. Validar datos heredados antes de adoptar el cambio.
6. El listado administrativo ahora incluye vínculos no visibles para permitir gestionarlos; necesita regresión visual. Cada producto solo devuelve configuración de la sucursal seleccionada. No se ejecutó navegador ni flujo real de pedido: iniciar Next con la configuración actual podría conectar servicios remotos, contrario al alcance autorizado.
7. Otras pantallas y endpoints fuera de este alcance pueden conservar accesos directos. No es una auditoría completa del repositorio ni de todos los permisos públicos. No se alteró el logging preexistente de auth; su revisión queda pendiente.

## Regresión pendiente con infraestructura local aislada

1. Configurar por separado un entorno de pruebas sin servicios remotos, con fixtures de dos tenants, dos sucursales del mismo tenant, mesas reales/virtuales, productos visibles/ocultos y marcas activas/inactivas. No se modificaron los `.env` del repositorio para hacerlo.
2. Abrir QR válido de mesa y `/pedir?restaurantId=...`; comprobar nombre/configuración comercial, marcas, productos, categorías, stock y pedido. Probar número de mesa inexistente, otro restaurante, número 0, QR sin sucursal, sucursal pausada/cerrada y takeaway. Revalidar mesa en envío y mantener aislamiento de pedidos.
3. Iniciar sesión administrativa de A; listar, editar, crear, cambiar disponibilidad y portada. Manipular URL/IDs/tenant/rol del body hacia B y confirmar rechazo sin efectos. Repetir tras desactivar admin y con cookie inválida/expirada. Probar producto sin marca y producto con marca ajena.
4. Confirmar selección de sucursal, stock y vínculos ocultos; comprobar que la respuesta no contiene configuraciones ajenas. Confirmar alcance global esperado al editar un producto compartido por sucursales propias.
5. Comprobar avisos y controles deshabilitados de fotos/logos. DELETE de producto con imágenes debe devolver 409 preservando archivos y metadatos. DELETE sin imágenes debe conservar la respuesta `{ok,id}` y comportamiento de relaciones conforme a las FK reales.
6. Con un servidor Next aislado, probar POST/PUT/PATCH/DELETE a APIs públicas (405), respuestas sin caché administrativa compartida y errores sin datos privados. Capturar red del navegador: ninguna consulta SQL/Storage directa desde estas cuatro pantallas.
7. En una fase autorizada posterior, verificar grants/RLS y denegación efectiva de escrituras anónimas/authenticated mediante clientes reales, antes y después del cierre. No usar los dobles de esta suite como evidencia de esa seguridad.

## Restricciones preservadas

Trabajo exclusivamente local. Sin SQL nuevo ni modificado, sin RLS/grants, sin Supabase remoto, sin cambios de secretos o `.env`, sin nuevas dependencias, sin commit/push/deploy ni cambio de rama. `qa/b7/b722t_billing_compile_ROLLBACK.sql` permanece untracked y no fue editado.
