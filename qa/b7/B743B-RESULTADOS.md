# B7.43B — Storage seguro (local)

Base: `db56bab`, rama `release/restosmart-v0.9-pro-pilot`. Fecha: 2026-10-25.

## Resultado y alcance

Se restauran subidas de fotos de productos y logos mediante APIs Next.js. Se conservan lectura pública y selección de portada. El cliente envía un archivo multipart, nunca una ruta de objeto. Cookie firmada y autorización contra `admin_users`, tenant y restaurante se validan antes de recibir el archivo o escribir Storage. Productos requieren pertenencia estricta a la sucursal seleccionada y todas sus sucursales deben pertenecer al mismo tenant. Logos requieren marca persistida del tenant y capacidad Multimarca. Alta de marca primero guarda sus datos y luego sube el logo; un fallo conserva el ID para reintentar. Igual para alta de producto.

Se inspeccionaron los ocho archivos de implementación solicitados y el informe B742F. Se reutilizan `adminAuth`, `authorizedAdminAccess`, `adminProductAccess` y el cliente `supabaseAdmin` existente, protegido por `server-only`. No se cambian claves ni se devuelven credenciales. Las dos pantallas siguen sin cliente Supabase. Se revisaron sus cambios con la checklist de React (estado, controles, hooks y ausencia de operaciones privilegiadas en navegador).

Archivos nuevos: `lib/adminImageStorage.ts`, `app/api/admin/marcas/[id]/logo/route.ts`, `qa/b7/b743b-storage-local.mjs` y SQL DRAFT separado. Se modifican las dos pantallas y el endpoint de imágenes de productos. Los endpoints de alta/edición de marcas conservan su contrato y autorización existente; quitar un logo guarda `logo_url: null` mediante ese flujo.

## Validación y rutas

- Máximo por archivo: 5 MiB; vacío rechazado. Cuerpo HTTP acotado antes de parsear multipart a 5 MiB + 64 KiB de envoltura, incluso sin Content-Length. Multipart malformado, campos adicionales y múltiples archivos por solicitud se rechazan.
- Solo JPEG, PNG y WebP: firma binaria y MIME deben coincidir. La extensión del nombre original se ignora; servidor asigna `.jpg`, `.png` o `.webp` según firma. SVG/HTML y otros formatos se rechazan. La comprobación de firma no es un decodificador completo ni antivirus: imágenes corruptas con cabecera válida pueden admitirse. No hay recodificación, eliminación de EXIF ni límite de dimensiones; quedan pendientes si se necesitan.
- Ruta `tenants/<sha256 del tenant>/productos|marcas/<sha256 del ID>/<UUID criptográfico>.<extensión>`. No se usa slug, nombre o ruta suministrados por navegador. `upsert: false` evita sobrescrituras. La URL pública se calcula en servidor.

## Eliminación y fallos parciales

La eliminación de una foto acepta exclusivamente `imageId`, verifica su producto y pertenencia, limpia primero la portada del producto si coincide con la URL almacenada y luego elimina la fila de `producto_imagenes`. No acepta `storage_path` ni URL del cliente. Puede quitar filas de rutas históricas sin deducir propiedad física a partir de sus nombres. Otras referencias permanecen intactas.

**El borrado físico permanece bloqueado por diseño.** Todos los objetos se conservan, sean nuevos, históricos, compartidos o de propietario ambiguo; respuesta `storageCleanup: deferred`. Una consulta que busque referencias seguida de `storage.remove` no garantiza seguridad frente a escrituras concurrentes. No se habilita ese patrón. Para purgar se necesita una fase autorizada con inventario, contrato de referencias completo y exclusión/atomicidad de escritores; deberá revisar al menos `producto_imagenes.image_url/storage_path`, `productos.imagen_url`, `marcas.logo_url` y cualquier referencia externa. No se presume que estas sean las únicas tablas consumidoras.

- Si falla la limpieza de portada, no se borra la fila ni el objeto. Si falla el borrado de fila, la portada puede quedar vacía, pero fila y objeto siguen disponibles; recargar y volver a seleccionar portada permite recuperar el estado.
- Si upload falla, no se insertan metadatos. Si la escritura de metadatos falla o su resultado es incierto, no se intenta borrar el objeto: la DB podría haber confirmado la escritura. Puede quedar un huérfano; se conserva para reconciliación. No existe cola persistente de reconciliación en este alcance.
- Reemplazar/quitar logo o eliminar marca tampoco borra el archivo anterior. Los datos de marca pueden quedar guardados aunque falle su logo; el error lo indica y permite reintentar.
- DELETE de producto con filas de imágenes sigue devolviendo 409. Primero se quitan las fotos desde el editor; luego se permite el DELETE autorizado existente. Un producto solo con URL histórica conserva el comportamiento previo: no hay borrado físico implícito. No se implementó limpieza masiva transaccional ni se inventaron cascadas.
- Portada sigue usando la URL almacenada y consultas separadas preexistentes. No hay transacción entre URL y flags: fallo parcial o concurrencia puede dejar flags inconsistentes y requiere recarga/reselección. Todas las comprobaciones de pertenencia y escrituras son consultas separadas: cambios concurrentes de pertenencia requieren garantías adicionales en DB. Ninguna de estas operaciones borra el objeto físico.
- Las subidas múltiples son secuenciales. Las confirmadas se retiran de pendientes y se muestran como existentes; fallos de red con resultado incierto requieren recargar antes de reintentar. No se garantiza idempotencia ni ausencia de huérfanos ante interrupciones.

## SQL DRAFT y seguridad remota

`qa/b7/b743b_storage_DRAFT.sql` contiene diagnóstico de bucket/policies, preflight que aborta ante otras policies de escritura, eliminación de las tres policies públicas verificadas y rollback documentado. No modifica `productos_public_read`, bucket ni SQL anteriores. El rollback posterior restaura definiciones capturadas previamente y advierte que reabriría escrituras inseguras. El guard es conservador: otras policies de buckets distintos también requieren revisión antes de continuar.

**NO APLICADO. Las escrituras públicas verificadas por el usuario siguen siendo un problema remoto hasta ejecutar un cierre autorizado.** El código usa exclusivamente service_role en servidor para estas subidas, pero no puede revocar permisos remotos por sí solo. El test de diseño verifica APIs/cliente y contenido del DRAFT; no demuestra denegación real de Storage. No se conectó Supabase, no se ejecutó SQL, no se invocó Storage remoto y no se consultaron políticas remotas. Se priorizó el alcance exclusivamente local sobre los pasos remotos de la skill Supabase.

## Verificación

Pruebas locales con módulos reales de autorización y handlers, DB en memoria y Storage simulado; no importan el cliente Supabase real ni leen `.env`. Se usa una clave efímera del fixture de tests. Cobertura: sin sesión, tenants/sucursales/productos/marcas ajenos, archivos vacíos/HTML/SVG/grandes/MIME incoherente, rutas manipuladas, altas simuladas, UUID y prefijos seguros, ausencia de upsert, lectura histórica, portada, objetos compartidos, fallos de upload/metadatos/limpieza y ausencia de Storage/credenciales en pantallas. También se prueba multipart real en memoria y su límite de cuerpo.

- `node_modules/.bin/tsc.cmd --noEmit`: exit 0 tras el último cambio de implementación.
- `node --test qa/b7/b742f-access-local.mjs qa/b7/b720e-security-local.mjs qa/b7/b743b-storage-local.mjs`: 42/42 aprobadas, exit 0 (30 existentes y 12 nuevas).
- `git diff --check`: exit 0; solo avisos de normalización LF/CRLF de Git en Windows.

La primera ejecución del test nuevo falló por escape de una expresión regular en el fixture; se corrigió antes de las pasadas finales. La suite B742F conserva su prueba de POST JSON heredado bloqueado (su título histórico habla de subida bloqueada); la nueva suite verifica explícitamente el contrato multipart habilitado.

## Pendientes y restricciones

No se ejecutó navegador ni servidor Next con configuración del proyecto para evitar conexiones remotas. Pendientes: regresión visual en móvil/escritorio, alta/edición/reintentos, portada después de borrar, cancelación de logo, producto con múltiples fotos y flujo completo con esquema/FK reales. Validar también límites del proveedor/proxy: pueden ser inferiores a 5 MiB y rechazar solicitudes antes del handler.

En una fase remota autorizada se debe aplicar/revisar el DRAFT, comprobar GET público y denegación efectiva de INSERT/UPDATE/DELETE anon y authenticated, y probar Storage mediante las APIs con dos tenants y fallos controlados. Revalidar RLS/grants de tablas de negocio y todos sus escritores: esto no es una auditoría completa de accesos directos fuera del alcance.

Sin cambios de `.env`, secretos, billing, webhooks, dependencias, rama o archivos SQL previos. Sin commit, push, deploy, reset, clean ni restore. `qa/b7/b722t_billing_compile_ROLLBACK.sql` se conserva untracked e intacto.
