# B7.47A — Auditoría final previa a RLS

Fecha: 2026-10-25. Revisión local de `3c94886`, rama `release/restosmart-v0.9-pro-pilot`.

**Dictamen: BLOQUEANTE para aplicar el cierre como si fuera completo.** La arquitectura actual permite cerrar los ocho objetos de B744B sin conservar lecturas directas del navegador sobre ellos, pero falta verificar el contrato real del servidor y cerrar vías adicionales. No se demuestra un corte inevitable de menús/QR por esos ocho REVOKE; tampoco se demuestra seguridad remota con los 95 tests. No se aplicó ni se autoriza SQL.

## Alcance y evidencia

Se inspeccionaron rutas `app/api`, pantallas `app`, componentes, bibliotecas, constructores y SQL de `qa/b5` y `qa/b7`, incluidos los dos DRAFT de seguridad. El anexo inventaría por línea los accesos y entradas HTTP encontrados en el árbol funcional, también dependencias embebidas en SELECT. Las referencias corresponden al checkpoint indicado, no al despliegue vivo.

No se leyó `.env` ni secretos; leer referencias a variables en código no revela sus valores. Sin red, Supabase remoto, SQL local/remoto, instalación, servidor Next, commit, push, deploy ni cambio de rama. El archivo untracked `qa/b7/b722t_billing_compile_ROLLBACK.sql` se preservó; no se usa como evidencia de una instalación. No se modificaron código funcional ni SQL existentes. Se aplicó la checklist de la skill Supabase a la inspección estática; sus pasos de conexión y verificación SQL quedan excluidos por la instrucción local del usuario.

## Hallazgos priorizados

| ID | Clase | Evidencia y efecto | Estado |
| --- | --- | --- | --- |
| H1 | BLOQUEANTE | `app/api/stats/route.ts:9` exige solo cookie firmada; `:17` lee todos los productos sin predicado de tenant/sucursal con service_role. Una sesión válida de A puede obtener id/categoría/disponibilidad de B; tampoco se revalida administrador activo. RLS de B744B no protege esta consulta privilegiada. Reparar autorización y scope o deshabilitar ruta. | Comprobado en código; no explotación remota ejecutada. |
| H2 | BLOQUEANTE | `app/admin/menu/page.tsx:4,96,98,185,211,257`: cliente público lee categorías y menú, borra por id, actualiza e inserta sin tenant/sucursal. Cookie administrativa no se transmite como JWT Supabase. B744B `:45` omite `categorias` y `menu_items`. Cerrar también esos objetos sin reparar la pantalla corta el menú heredado; dejarlos como están puede conservar acceso indebido si existen grants/policies permisivos. | Consumo y omisión comprobados; existencia/permisos y uso real pendientes. |
| H3 | BLOQUEANTE | B744B `:45,65,97` solo trata ocho tablas y cuatro secuencias; no marcas, categorías, menú, vistas, cobros, admin_users, configuración, billing, RPC/default ACL. Analytics consulta `vw_tiempos_pedido` (`app/api/admin/analytics/route.ts:1219`). Una vista con derechos del dueño o una función DEFINER accesible puede conservar una vía a datos cerrados. | Omisiones comprobadas; exposición efectiva no inspeccionada. |
| H4 | BLOQUEANTE | B744B `:25` valida nombres de tres policies, pero no cmd/roles/expresiones ni otras policies ALL/escritura; no valida bucket público/read. B743B `:15,23` es más estricto y aborta ante otra policy de escritura incluso de otro bucket. No ejecutar ambos como pasos sucesivos: B743B elimina las policies que B744B exige. | Comprobado en borradores; estado remoto según contexto del usuario, no consultado aquí. |
| H5 | BLOQUEANTE | B744B `:73,84` concede DML y secuencias al servicio, pero no verifica BYPASSRLS/owner/FORCE RLS, USAGE de schemas, permisos de columnas, dependencias de triggers, funciones ni secuencias reales. El ensayo B744D `:107` concede todas las secuencias public al servicio; es más amplio que el DRAFT. Hay riesgo de error de permisos durante alta/cambio de pedido, historial, stock o imágenes. | Diferencia local comprobada; corte concreto depende del catálogo. |
| H6 | BLOQUEANTE | El repositorio no prueba qué revisión sirve producción ni qué bundles/pestañas/preview antiguos siguen usando navegador. Retirar permisos y policies rompe sus accesos directos y uploads; mantener un servidor antiguo con service_role puede preservar APIs vulnerables aunque cierre SQL. | Incertidumbre operativa, requiere despliegue coordinado y evidencia. |
| H7 | BLOQUEANTE | `app/mesa/[mesaId]/cuenta/page.tsx:62,63` filtra `pedido.mesa_id`; `app/api/admin/pedidos-operacion/route.ts:25` no selecciona `mesa_id`. Aun con personal autenticado se obtiene una lista vacía por contrato incompatible. También rompe detalle mozo (`app/mozo/mesas/[mesaId]/page.tsx:307,309`) y agrupación por mesa (`app/mozo/mesas/page.tsx:746,772,800`). Bloquea el piloto de salón. La cuenta ya exige personal (`:67`), no es una nueva rotura causada por RLS. | Comprobado estáticamente; no ensayado en navegador. |
| H8 | IMPORTANTE | `app/api/admin/session/route.ts:125` devuelve tenant del token sin volver a consultar activo; `:186` usa resolveAdminAccess, aunque luego verifica propietario. `/stats` usa solo requireAdminAuth. En cambio resolveAuthorizedAdminAccess (`lib/authorizedAdminAccess.ts:26,38`) comprueba identidad, activo y sucursal. La sesión tiene TTL 12 h; desactivar admin no revoca por sí solo las respuestas de esas dos rutas. | Comprobado; no equivale a autorización ajena en rutas que sí revalidan. |
| H9 | IMPORTANTE | `lib/adminAuth.ts:238` registra prefijo de cookie y metadatos de autenticación; `:93` conserva contraseña plana legacy como alternativa. Login usa `ilike` con entrada de email (`app/api/admin/login/route.ts:36`): revisar comodines y coincidencia exacta. No se encontró limitador en ese handler. | Código comprobado; no se afirma existencia de passwords planos ni ausencia de defensa externa. |
| H10 | IMPORTANTE | `app/api/public/retiro/route.ts:153` y sus proyecciones publican nombre, código/id y tiempos de pedidos por sucursal sin sesión. Es un acceso deliberado de pantalla pública; confirmar mínimo de datos aceptado para piloto. RLS cerrada no lo restringe porque usa servicio. | Comprobado, no se etiqueta como fuga por defecto. |
| H11 | IMPORTANTE | Delivery efectivo actualiza pedidos directamente (`app/api/delivery/pedidos/[id]/estado-efectivo/route.ts:176`), mientras cobros usa RPC B724. Validar coexistencia de estado de pedido y snapshot order_collections con trigger real; 95 tests/B746A no prueban ese handler completo con ambos contratos. | Escritores distintos comprobados; divergencia efectiva pendiente de ensayo. |
| H12 | POSTPILOTO | Portada y metadata son varias escrituras (`app/api/admin/productos/[id]/imagenes/route.ts:44,46,48`); subidas pueden dejar huérfanos. Limpieza física diferida (`lib/adminImageStorage.ts:47`). Firma/MIME no decodifica imagen ni quita EXIF. | Riesgos ya documentados en B743B; no impiden por sí mismos revocar escritura pública. |

## Identidades y frontera de confianza

`lib/supabaseClient.ts:6` construye con anon key, persistencia predeterminada. Único consumidor funcional encontrado: `/admin/menu`. No hay llamadas a `supabase.auth`, constructor SSR/browser adicional ni login Supabase en el árbol funcional inspeccionado: normalmente opera como anon. Un JWT Supabase persistido por otra versión podría convertirlo en authenticated; no asumirlo imposible. La cookie propia no crea esa identidad.

`lib/supabaseAdmin.ts:1,6,16` es server-only, clave service_role, sin persistencia/refresh. `lib/tenant.ts:1,16,20` tiene otro constructor server-only service_role; sus consultas reciben cliente como parámetro y el resolver usa ese constructor por defecto (`:144`). No se encontró consumidor funcional del resolver fuera de esa biblioteca. No se expone clave de servicio en pantallas. No se leyó ningún valor de configuración.

Autenticación propia: `lib/adminAuth.ts:100,117,143,159,228` firma HMAC, valida expiración, cookie HttpOnly/Secure en producción/SameSite lax. `lib/authorizedAdminAccess.ts:16` resuelve admin activo y propietario de sucursal desde DB; query/body/cookies de tenant/sucursal son selectores no confiables que deben contrastarse con esa resolución. Los helpers de producto (`lib/adminProductAccess.ts:7,17,21,26`) además revisan vínculos y propiedad compartida. No hay Server Actions (`use server`) ni middleware/proxy del proyecto encontrados; las barreras están en handlers. Layout cliente no protege Data API.

## Impacto por flujo al cerrar B744B

| Flujo | Recorrido actual y resultado esperado | Condición pendiente |
| --- | --- | --- |
| Menú público, pedir y QR | `app/pedir/page.tsx:253,362,579`; `app/mesa/[mesaId]/page.tsx:21,122,397` → APIs públicas contexto/mesa/productos y POST pedidos → servicio. No requieren SELECT anon de las ocho tablas. | owner_tenant_id, estado, vínculos visibles y mesas reales/virtuales correctos; RPC y dependencias accesibles al servicio. |
| Cocina/mozo/caja/mostrador | `lib/orderOperationsClient.ts:9,15`, `app/cocina/page.tsx:474,612`, `app/mostrador/page.tsx:845,1464` → GET privado pedidos y operaciones. Cierre anon compatible con sesión válida. | Personal necesita cookie administrativa; no reabrir tablas para dispositivos sin login. Ensayar envío, estado, caja, cerrar y lotes. |
| Cuenta mesa | Usa API privada y no SQL directo; el cierre no habilita cuenta pública ni pago desde cliente. | Reparar H7 para cuenta y mozo autorizados; no atribuir a RLS un fallo anterior. |
| Delivery | UI `app/admin/delivery/page.tsx:38,114` → lista y decisión autenticadas, servicio. Bot WhatsApp desactivado en webhook. Bibliotecas deliveryBot/whatsapp conservan escritores latentes inventariados. | H11; no reactivar bot como parte del cierre. |
| Cobros | `components/CollectionCheckout.tsx:11,35` usa configuración pública y token para declarar; `app/api/public/cobros/route.ts:24,26` deriva ámbito desde token y fija customer/declare. API admin `:44,48` deriva operador/tenant y llama RPC. | No otorgar RPC a anon para compensar errores: p_operator es texto, no identidad SQL. Validar tokens, derechos y triggers instalados. |
| Administración | Productos, marcas, restaurantes, mesas, configuración y analytics usan servidor autenticado; H1/H2/H8 son excepciones relevantes. | Objetos omitidos y vista de analytics; permisos del servicio para altas de restaurants/mesas/productos y sus secuencias. |
| Fotos/logos | UI `app/admin/productos/page.tsx:917,931,945`; `app/admin/marcas/page.tsx:289` → handlers con autorización, bytes/MIME/tamaño, path asignado, upsert:false. Public URLs y bucket público permanecen para lectura. | DML metadata/marcas y secuencias, Storage servicio, GET histórico público. DELETE metadata no borra objeto físico. Public read no autoriza escritura. |
| Signup/billing | Signup escribe restaurants/admin/config/subscriptions por servicio; checkout y webhook billing usan servicio/RPC. B744B no debe convertirlos en consumidores anon. | Permisos y funciones de objetos adicionales; no confundir billing comercial con cobros de pedidos. |
| Menú heredado | `/admin/menu` conserva anon directo sobre objetos fuera del DRAFT. | Resolver H2 antes de ampliar cierre; uso real y grants pendientes. |

## Auditoría de SQL y objetos públicos

B744B `:4,5,6,124` es transacción con timeouts y ROLLBACK final: ejecutarlo literalmente no deja cierre persistente. No editarlo ni reemplazar silenciosamente ROLLBACK por COMMIT. B743B `:35` sí contiene COMMIT; el nombre DRAFT no evita su efecto si se ejecuta. Ninguno está autorizado.

B744B revoca PUBLIC además de anon/authenticated, un punto favorable. `has_table_privilege` del postflight considera privilegios efectivos, incluidas vías heredadas aplicables, pero solo comprueba SELECT/INSERT/UPDATE/DELETE de ocho tablas. No elimina membresías, no examina grants por columna (`has_any_column_privilege`), vistas, funciones ni secuencias, ni prueba llamadas como cada rol. Verificar también TRUNCATE/REFERENCES/TRIGGER, propietarios, opciones de membresía/SET ROLE y acceso a schemas. Un grant heredado que persista hará abortar ese postflight; no se debe ignorar para lograr COMMIT.

Las ACL por defecto no cambian con REVOKE a objetos existentes. Inspeccionar `pg_default_acl` por cada rol creador y schema, ACL nulas y PUBLIC implícito; los futuros objetos/funciones podrían volver a exponerse. La secuencia de un id no debe inferirse por sufijo: resolver dependencias OWNED BY/identity/defaults, secuencias compartidas y grants efectivos. B744B fija cuatro nombres (`:65`), omite las de restaurants/mesas/productos y las de objetos adicionales. Que no cambie sus permisos no prueba exposición ni que el servicio pueda hacer nextval. Un objeto inexistente aborta la transacción; el preflight solo verifica ocho relaciones, no su tipo ni secuencias.

ENABLE RLS no borra policies permisivas existentes, no agrega predicates de pertenencia, no fuerza RLS para owner ni demuestra BYPASSRLS del servicio. La estrategia prevista es bloquear Data API directa y autorizar en API servidor; el servicio seguirá pudiendo acceder a varios tenants. H1 demuestra por qué RLS no sustituye esa autorización. Revisar vistas/materializadas y su dueño/opciones, especialmente `vw_tiempos_pedido`; no se halló definición CREATE VIEW ni SECURITY DEFINER en los SQL inspeccionados de qa/b5/b7. Eso no prueba su ausencia en remoto. Inventariar todas las funciones expuestas y overloads, EXECUTE para PUBLIC/roles, DEFINER, search_path, cuerpos y entradas controladas por cliente; incluir schemas expuestos distintos de public.

B5.2 `qa/b5/restosmart_create_order_atomic_b52_DRAFT.sql:12,13,200,202` y B724 `qa/b7/b724_order_collections_DRAFT.sql:48,79,96,112,128,157,172` declaran INVOKER/search_path vacío y restringen EXECUTE al servicio. B722Q `:17,18,173` sigue ese patrón para billing. Son contratos propuestos; las ACL/definiciones instaladas pueden diferir. B744B no revoca EXECUTE de ninguna función. B724 acepta p_tenant/p_restaurant/p_operator: sus comprobaciones no convierten un texto de operador en autenticación; hacer pública la RPC permitiría intentar suplantación de operador si los otros derechos lo permiten.

Triggers INVOKER ejecutan sus consultas con el contexto del escritor. B744D `:39,64,74` reproduce historial/updated_at; historial inserta en `pedido_estados_historial` y consume su secuencia. B724 snapshot escribe cobros/eventos y consulta configuración; guards leen pedidos/cobros; B5 escribe pedidos/items y modifica stock de producto_restaurantes. Se necesita inventario real de todas esas dependencias, FK/cascadas y triggers adicionales. B746A ensayó lógica como superusuario; no es prueba de permisos del servicio. No proponer SECURITY DEFINER como parche para un permiso faltante.

Storage: policies permisivas aplicables se combinan por OR, sujetas también a policies restrictivas; quitar tres nombres no descarta otra vía ALL/INSERT/UPDATE/DELETE. Deben inspeccionarse todas las definiciones, roles y buckets afectados, ACL/RLS de storage.objects y configuración de buckets. Conservar lectura pública prevista permite logos/fotos por URL, no implica listar/escribir objetos. B743B detecta policies adicionales de escritura, aunque su control global puede bloquear innecesariamente por otro bucket; revisar alcance, no saltar el guard. B744B carece de ese control y de postflight Storage. El bucket y SELECT no están validados por ese archivo.

Locks: ALTER TABLE ENABLE RLS puede exigir locks fuertes; mantener orden estable y transacción corta, revisar bloqueadores antes de ventana. Timeouts de 3/30 s en B744B limitan espera pero no prueban disponibilidad ni evitan colas; B743B no fija esos límites. El preflight B744B solo rechaza nombre restosmart_qa: no identifica el proyecto correcto, propietario/versión/definiciones ni evita otra base equivocada. Fallar debe producir rollback integral con ON_ERROR_STOP y cierre de conexión; no continuar después de errores.

Contingencia: rollback transaccional antes de COMMIT. Después, preferir reparar grants mínimos al backend o volver a una versión compatible con el cierre; suspender la operación afectada conservando pedidos/pagos/evidencia. Las líneas `b743b_storage_DRAFT.sql:41,45` describen restaurar policies inseguras: no adoptarlas como primera opción. No usar `b724_order_collections_ROLLBACK.sql:3` como reversión de RLS: elimina guards/RPC y archiva tablas de cobros, cambiando otro contrato.

## Qué prueban los 95 tests y qué falta

`B745A-RESULTADOS.md:6` informa 18 tests HTTP y 77 anteriores, 125 solicitudes. No son 95 flujos completos ni 95 tests de DB. B745A sustituye DB/Storage y resolveAdminAccess; mantiene HMAC y resolver autorizado real. El adaptador HTTP implementa 405/Allow, no prueba router Next, middleware, caché ni navegador (`:12` en adelante). Las suites B722R/S/V incluyen aserciones estáticas de código/SQL; pasar no ejecuta la RPC billing. B742F verifica ausencia de SQL/Storage solo en cuatro componentes (`qa/b7/b742f-access-local.mjs:158`); no incluye `/admin/menu`. B743B valida paths/bytes/autorización y fallos simulados, no policies reales.

B746A tiene un estado inicial pendiente, superado por adenda B746B (`B746A-RESULTADOS.md:62` en adelante): ejecución PostgreSQL16 exit 0/NOTICE PASS/ROLLBACK y ausencia posterior de fixtures. Se acepta esa evidencia reportada; no se reejecutó SQL. No hay huella completa anterior/posterior de secuencias/ACL; fixtures usan superusuario y control_stock=false. B744D aporta historial real reproducido, no identidad de definición remota ni ejecución con rol service_role.

Prioridad de ensayos nuevos, sin duplicar rechazo de uploads o cookies ya cubiertos:

1. BLOQUEANTE: H1 con admin A/B y admin desactivado; H2 con permisos cerrados después de reparar/desactivar pantalla; no repetir solamente 401 de otras APIs.
2. BLOQUEANTE: cadena HTTP → RPC → triggers → historial/cobros/stock con rol real del servicio en laboratorio, grants exactos del cierre y sin grants globales auxiliares; comprobar anon/authenticated directos negativos, RPC/overloads y columnas/vistas. No ejecutar en esta auditoría.
3. BLOQUEANTE para salón: cuenta y mozo autenticados con dos mesas (H7); IMPORTANTE: caja/cerrar/enviar/cancelar/lotes, delivery efectivo con snapshot B724 (H11); una prueba por contrato distinto, no una por botón equivalente.
4. BLOQUEANTE para rollout: navegador Next aislado y posterior smoke coordinado sobre build objetivo, menús/QR/retirada, admin y uploads/URLs históricas; verificar que ya no usa SDK público salvo excepción resuelta. Las pruebas simuladas no cubren bundle viejo.
5. IMPORTANTE: stock concurrente, errores de permisos/secuencias y rollback atómico; positivos de configuración no nula, confirmación/declaración/incidencia con API real. B746A ya cubre reglas SQL funcionales sin stock: reutilizar fixtures, no duplicar todas sus aserciones.
6. POSTPILOTO: atomicidad de portada, idempotencia/huérfanos y recodificación, si el piloto acepta esas limitaciones.

## Correspondencia de objetos objetivo y consumidores

Todos los sitios `.from` están enumerados en anexo A, incluso escritores latentes no conectados al piloto; el siguiente índice permite buscar por objeto y agrega joins, efectos SQL y secuencias que no tienen llamada SDK propia.

| Objeto | Consumidores comprobados y líneas | Identidad y operaciones |
| --- | --- | --- |
| restaurants | `lib/publicOrderingContext.ts:7`, `lib/authorizedAdminAccess.ts:53`, `lib/adminAccess.ts:126,142,159`, `lib/tenant.ts:81,98,173`, `lib/deliveryBot.ts:92,112,126,137`; APIs pedidos `:178,193`, productos `:309`, productos/[id] `:268`, categorías/[id] `:121`, public/retiro `:93`, public/cobros `:10`, admin/restaurants `:159,288,311,326,357,428,463`, signup `:52,132,166,191,222`; analytics `:911,916,953,971,976` | Servicio: lectura y CRUD en alta/configuración de sucursales/signup. Las referencias completas usan prefijo app/api en anexo A. No consumidor anon actual encontrado sobre esta tabla. |
| mesas | `app/api/public/mesa/route.ts:12`, pedidos `:506,546,747`, admin/mesas `:167,253,267`, operaciones-resumen `:198`; `qa/b7/b719f_mesas_virtuales.sql:39` | Servicio: lectura/creación, incluidas virtuales; scripts de laboratorio/migración no son navegador. |
| productos | APIs productos `:570,740`, productos/[id] `:628,788`, disponible `:173`, admin/productos `:25`, imágenes `:44,81`, stats `:17`, categorías/[id] `:293,372`, pedidos `:304`, admin/marcas/[id] `:153`; `lib/adminProductAccess.ts:12`, deliveryBot `:341,358` | Servicio: lectura/CRUD/disponibilidad/portada. Joins de pedidos `:725`, operaciones `:28`, analytics `:631,877,1310` también requieren acceso. H1 es lectura sin scope. |
| producto_restaurantes | `lib/adminProductAccess.ts:7,17`; APIs pedidos `:329`, productos `:277,380,404,445`, productos/[id] `:311,380,404,445,647,682,691`, admin/productos `:20`, categorías/[id] `:142`, analytics `:622,1301` | Servicio: vínculos, visibilidad/stock y CRUD; B5.2 consulta/bloquea/actualiza stock. |
| pedidos | APIs pedidos `:700,1106`, operaciones `:25,49,79`, operaciones-resumen `:202,207`, delivery-pendientes `:47`, estado-efectivo `:74,176`, public/retiro `:153`, analytics `:650,865,1576,1586`; `lib/deliveryBot.ts:377,446,460,465,483` | Servicio: lectura/alta por RPC/estados/caja/pago. DeliveryBot conserva INSERT y compensación DELETE latentes. |
| items_pedido | `app/api/admin/pedidos-operacion/route.ts:60,71`, `lib/deliveryBot.ts:479`; joins `app/api/pedidos/route.ts:721`, operaciones `:28`, analytics `:657,875`; B5.2 inserta items | Servicio: lectura, alta y comentarios de cocina. No inferir ausencia por buscar solo `.from`. |
| pedido_estados_historial | `qa/b7/b744d_historial_LOCAL_ROLLBACK.sql:45,55` INSERT desde trigger; `app/api/admin/analytics/route.ts:1219` consulta vista vw_tiempos_pedido, cuya dependencia real requiere catálogo | No hay `.from` directo funcional al historial. Trigger INVOKER requiere permisos del escritor en tabla/secuencia. No se afirma definición remota de vista. |
| producto_imagenes | API imágenes `:28,39,46,48,66,78,83`, productos/[id] `:778` | Servicio: lectura/INSERT/UPDATE/DELETE metadata, guard de borrado de producto. |
| marcas | APIs public/contexto `:10`, pedidos `:366`, productos `:214,246`, productos/[id] `:215,247`, admin/marcas `:162,177,196,254,345`, admin/marcas/[id] `:171,186,292,369`, logo `:17,27`, analytics `:1106`; `lib/adminProductAccess.ts:26` | Servicio: lectura pública proyectada y CRUD administrativo; omitida por B744B. URLs de logo en snapshots/menú no son llamada a storage.objects. |
| storage.objects | `app/api/admin/productos/[id]/imagenes/route.ts:62,63,65`, `app/api/admin/marcas/[id]/logo/route.ts:23,24,26`; DRAFT B743B `:5,29`, B744B `:93` | SDK Storage de servicio: upload y getPublicUrl en bucket productos; getPublicUrl construye URL y no certifica GET. Navegador lee URLs públicas de fotos/logos. No hay remove/upsert en consumidores funcionales; DELETE de metadata conserva archivos. No hay `.from('storage.objects')` de aplicación. |
| Secuencias | B744B `:65,84` lista pedidos/items/historial/imágenes; B744D `:107` otorga todas temporalmente; B724 `:45,46` trata order_collection_events_id_seq | Consumo implícito de nextval/identity en INSERT de servicio/RPC/triggers, no hay cliente JS de secuencias. Resolver catálogo para restaurants/mesas/productos/categorias/menu_items y demás tablas con id/default; no inventar nombres ni asumir UUID/serial. |

## Incertidumbres que requieren lectura remota autorizada

No se inventó catálogo remoto: grants/roles/membresías, policies/RLS/FORCE, vistas, funciones DEFINER, PUBLIC EXECUTE, defaults, secuencias, triggers, buckets, schemas expuestos y build activo siguen sin verificar. El contexto confirma escrituras públicas de Storage aún presentes; esta entrega no las observó. El plan compañero define la consulta de catálogo requerida sin generar una migración ejecutable.

## Verificación de esta entrega

`node_modules/.bin/tsc.cmd --noEmit`: exit 0, sin diagnósticos. `git diff --check`: exit 0. Los 95 tests no se reejecutan: no hay cambio funcional y no resuelven las incertidumbres de catálogo. Ver inventarios siguientes para trazabilidad completa. Los archivos nuevos se revisan además por whitespace porque el diff ordinario no incluye archivos untracked.

## Anexo A — Inventario por archivo y línea de todos los accesos SDK

SR = servidor service_role; PUB = navegador anon o authenticated si conserva JWT; PARAM/SR = cliente recibido, servicio por defecto en tenant.ts. Fragmento contiguo muestra operación, proyección y joins. Array.from/Buffer.from excluidos. Las referencias son relativas a raíz.

| Archivo:línea | Identidad | Acceso y operación contigua |
| --- | --- | --- |
| app/admin/menu/page.tsx:96 | PUB | supabase.from('categorias').select('*').order('orden', { ascending: true }), supabase .from('menu_items') .select(  |
| app/admin/menu/page.tsx:98 | PUB | .from('menu_items') .select(  id, categoria_id, |
| app/admin/menu/page.tsx:185 | PUB | const { error } = await supabase.from('menu_items').delete().eq('id', item.id);  if (error) { console.error(error); alert('Error al eliminar el ítem'); |
| app/admin/menu/page.tsx:211 | PUB | .from('menu_items') .update({ categoria_id: formData.categoria_id, nombre: formData.nombre, descripcion: formData.descripcion, |
| app/admin/menu/page.tsx:257 | PUB | .from('menu_items') .insert({ categoria_id: formData.categoria_id, nombre: formData.nombre, descripcion: formData.descripcion, |
| app/api/admin/analytics/route.ts:622 | SR | .from('producto_restaurantes') .select(  restaurant_id, producto_id, |
| app/api/admin/analytics/route.ts:650 | SR | .from('pedidos') .select(  id, restaurant_id, |
| app/api/admin/analytics/route.ts:865 | SR | .from('pedidos') .select(  id, estado, |
| app/api/admin/analytics/route.ts:911 | SR | .from('restaurants') .select('id, slug, owner_tenant_id') .eq('owner_tenant_id', tenantId),  supabaseAdmin |
| app/api/admin/analytics/route.ts:916 | SR | .from('restaurants') .select('id, slug, owner_tenant_id') .eq('slug', tenantId).eq('owner_tenant_id', tenantId), ]);  |
| app/api/admin/analytics/route.ts:953 | SR | .from('restaurants') .select('id, slug, owner_tenant_id') .eq('id', accessRestaurantId) .maybeSingle();  |
| app/api/admin/analytics/route.ts:971 | SR | .from('restaurants') .select('id, slug, owner_tenant_id') .eq('owner_tenant_id', tenantId),  supabaseAdmin |
| app/api/admin/analytics/route.ts:976 | SR | .from('restaurants') .select('id, slug, owner_tenant_id') .eq('slug', tenantId).eq('owner_tenant_id', tenantId), ]);  |
| app/api/admin/analytics/route.ts:1106 | SR | .from('marcas') .select('id, nombre, color_hex, logo_url') .in('id', uniqueIds);  if (error) { |
| app/api/admin/analytics/route.ts:1219 | SR | .from('vw_tiempos_pedido') .select(  pedido_id, mesa_id, |
| app/api/admin/analytics/route.ts:1301 | SR | .from('producto_restaurantes') .select(  restaurant_id, producto_id, |
| app/api/admin/analytics/route.ts:1576 | SR | .from('pedidos') .select('id', { count: 'exact', head: true }) .in('restaurant_id', analyticsScope.restaurantIds) .gte('creado_en', isoDesde) .lte('creado_en', isoHasta) |
| app/api/admin/analytics/route.ts:1586 | SR | .from('pedidos') .select(  id, creado_en, |
| app/api/admin/billing/checkout/route.ts:246 | SR | .from('tenant_subscriptions') .select('plan, status') .eq('tenant_id', access.tenantId) .maybeSingle();  |
| app/api/admin/billing/checkout/route.ts:331 | SR | .from('billing_checkout_sessions') .insert({ tenant_id: access.tenantId, restaurant_id: access.restaurant?.id ?? null, kind: intent.kind, |
| app/api/admin/billing/checkout/route.ts:405 | SR | .from('billing_checkout_sessions') .update({ status: 'rejected', updated_at: new Date().toISOString(), }) |
| app/api/admin/billing/checkout/route.ts:433 | SR | .from('billing_checkout_sessions') .update({ mp_preference_id: mpBody.id, updated_at: new Date().toISOString(), }) |
| app/api/admin/cobros/route.ts:26 | SR | supabaseAdmin.from('order_collections').select('order_id,method,amount,currency,state,require_payment,created_at,updated_at').eq('tenant_id', ctx.tenant!).eq('restaurant_id', ctx.restaurant!).order('created_at', { ascending: false }).limit(100), supabaseAdmin.from('order_collection_events').select('id,order_id,action,operator,note,created_at').eq('tenant_id', ctx.tenant!).eq('restaurant_id', ctx.restaurant!).order('created_at', { ascending: false }).limit(200), ]); if (payments.error \|\| events.error) throw new Error(); return NextResponse.json({ ...config, payments: payments.data, events: events.data }, { headers: { 'Cache-Control': 'private, no-store' } }); |
| app/api/admin/cobros/route.ts:27 | SR | supabaseAdmin.from('order_collection_events').select('id,order_id,action,operator,note,created_at').eq('tenant_id', ctx.tenant!).eq('restaurant_id', ctx.restaurant!).order('created_at', { ascending: false }).limit(200), ]); if (payments.error \|\| events.error) throw new Error(); return NextResponse.json({ ...config, payments: payments.data, events: events.data }, { headers: { 'Cache-Control': 'private, no-store' } }); } catch { return NextResponse.json({ error: 'Cobros no disponible. Verificá la migración B7.24.' }, { status: 503 }); } |
| app/api/admin/cobros/route.ts:44 | SR | const result = await supabaseAdmin.rpc('restosmart_collection_config_v1', { p_tenant: ctx.tenant, p_restaurant: ctx.restaurant, p_scope: body.scope === 'tenant' ? 'tenant' : restaurant:${ctx.restaurant}, p_config: config, p_operator: ctx.operator }); return result.error ? NextResponse.json({ error: 'No se pudo guardar la configuración.' }, { status: 409 }) : NextResponse.json({ ok: true }); } if (!['confirm', 'incident'].includes(body.action) \|\| !Number.isSafeInteger(body.orderId) \|\| body.orderId <= 0 \|\| (body.action === 'incident' && (typeof body.note !== 'string' \|\| !body.note.trim()))) return NextResponse.json({ error: 'Operación inválida.' }, { status: 400 }); const result = await supabaseAdmin.rpc('restosmart_collection_action_v1', { p_tenant: ctx.tenant, p_restaurant: ctx.restaurant, p_order: body.orderId, p_token: null, p_action: body.action, p_operator: ctx.operator, p_note: typeof body.note === 'string' ? body.note.slice(0, 1000) : null }); |
| app/api/admin/cobros/route.ts:48 | SR | const result = await supabaseAdmin.rpc('restosmart_collection_action_v1', { p_tenant: ctx.tenant, p_restaurant: ctx.restaurant, p_order: body.orderId, p_token: null, p_action: body.action, p_operator: ctx.operator, p_note: typeof body.note === 'string' ? body.note.slice(0, 1000) : null }); return result.error ? NextResponse.json({ error: 'El pago no está disponible o ya fue resuelto. Actualizá la pantalla.' }, { status: 409 }) : NextResponse.json({ ok: true }); } |
| app/api/admin/delivery-pedidos-pendientes/route.ts:47 | SR | .from('pedidos') .select(  id, codigo_publico, |
| app/api/admin/local-config/route.ts:146 | SR | .from('configuracion_local') .select('*') .order('id', { ascending: true }) .limit(1) .maybeSingle(); |
| app/api/admin/local-config/route.ts:158 | SR | .from('configuracion_local') .select('*') .eq('restaurant_id', restaurantId) .order('id', { ascending: true }) .limit(1) |
| app/api/admin/local-config/route.ts:236 | SR | .from('configuracion_local') .update(payload) .eq('id', current.id) .select('*') .single(); |
| app/api/admin/local-config/route.ts:261 | SR | .from('configuracion_local') .insert(payload) .select('*') .single();  |
| app/api/admin/login/route.ts:34 | SR | .from('admin_users') .select('*') .ilike('email', email) .limit(1) .maybeSingle(); |
| app/api/admin/marcas/route.ts:162 | SR | .from('marcas') .select('id') .eq('tenant_id', access.tenantId) .order('orden', { ascending: true }) .order('creado_en', { ascending: true }) |
| app/api/admin/marcas/route.ts:177 | SR | const { error: insertError } = await supabaseAdmin.from('marcas').insert([ { tenant_id: access.tenantId, restaurant_id: access.restaurant?.id ?? null, slug: access.restaurant?.slug ?? access.tenantId, |
| app/api/admin/marcas/route.ts:196 | SR | .from('marcas') .select('id', { count: 'exact', head: true }) .eq('tenant_id', tenantId) .eq('activa', true);  |
| app/api/admin/marcas/route.ts:254 | SR | .from('marcas') .select(MARCAS_SELECT) .eq('tenant_id', access.tenantId) .order('activa', { ascending: false }) .order('orden', { ascending: true }) |
| app/api/admin/marcas/route.ts:345 | SR | .from('marcas') .insert([payload]) .select(MARCAS_SELECT) .single();  |
| app/api/admin/marcas/[id]/route.ts:153 | SR | .from('productos') .select('id', { count: 'exact', head: true }) .eq('marca_id', marcaId);  if (error) { |
| app/api/admin/marcas/[id]/route.ts:171 | SR | .from('marcas') .select('id, nombre, activa') .eq('id', id) .eq('tenant_id', tenantId) .maybeSingle(); |
| app/api/admin/marcas/[id]/route.ts:186 | SR | .from('marcas') .select('id', { count: 'exact', head: true }) .eq('tenant_id', tenantId) .eq('activa', true) .neq('id', excludedId); |
| app/api/admin/marcas/[id]/route.ts:292 | SR | .from('marcas') .update(payload) .eq('id', id) .eq('tenant_id', access.tenantId) .select(MARCAS_SELECT) |
| app/api/admin/marcas/[id]/route.ts:369 | SR | .from('marcas') .delete() .eq('id', id) .eq('tenant_id', access.tenantId) .select('id') |
| app/api/admin/marcas/[id]/logo/route.ts:17 | SR | const { data: brand, error: lookupError } = await supabaseAdmin.from('marcas').select('id').eq('id', id).eq('tenant_id', access.tenantId).maybeSingle(); if (lookupError \|\| !brand) return NextResponse.json({ error: 'Marca no disponible.' }, { status: 404 }); if (!request.headers.get('content-type')?.startsWith('multipart/form-data')) return NextResponse.json({ error: 'Use multipart.' }, { status: 409 }); try { const image = await readAdminImage(request); |
| app/api/admin/marcas/[id]/logo/route.ts:23 | SR | const bucket = supabaseAdmin.storage.from('productos'); const { error: uploadError } = await bucket.upload(path, image.bytes, { contentType: image.mime, upsert: false }); if (uploadError) throw uploadError; const url = bucket.getPublicUrl(path).data.publicUrl; const { data, error } = await supabaseAdmin.from('marcas').update({ logo_url: url }).eq('id', id).eq('tenant_id', access.tenantId).select('id').maybeSingle(); |
| app/api/admin/marcas/[id]/logo/route.ts:27 | SR | const { data, error } = await supabaseAdmin.from('marcas').update({ logo_url: url }).eq('id', id).eq('tenant_id', access.tenantId).select('id').maybeSingle(); // An uncertain DB result may have committed: retain the object for reconciliation. if (error \|\| !data) throw new Error('metadata'); return NextResponse.json({ ok: true, logo_url: url }, { status: 201 }); } catch (error) { return NextResponse.json({ error: error instanceof ImageInputError ? error.message : 'No se pudo guardar la imagen. Recargue antes de reintentar.' }, { status: error instanceof ImageInputError ? 400 : 500 }); } |
| app/api/admin/mesas/route.ts:160 | SR | .from('configuracion_local') .select('nombre_local, business_mode') .eq('restaurant_id', restaurantId) .limit(1) .maybeSingle(); |
| app/api/admin/mesas/route.ts:167 | SR | .from('mesas') .select('id, nombre, numero, restaurant_id') .eq('restaurant_id', restaurantId) .gt('id', DELIVERY_MESA_ID);  |
| app/api/admin/mesas/route.ts:232 | SR | .from('configuracion_local') .select('nombre_local, business_mode') .eq('restaurant_id', restaurantId) .limit(1) .maybeSingle(); |
| app/api/admin/mesas/route.ts:253 | SR | .from('mesas') .select('id, nombre, numero, restaurant_id') .eq('restaurant_id', restaurantId) .gt('id', DELIVERY_MESA_ID);  |
| app/api/admin/mesas/route.ts:267 | SR | .from('mesas') .insert({ nombre: nombreFinal, numero: numeroNuevo, restaurant_id: restaurantId, |
| app/api/admin/operaciones-resumen/route.ts:198 | SR | .from('mesas') .select('id, numero, nombre').eq('restaurant_id', restaurant.id) .order('id', { ascending: true }), supabaseAdmin .from('pedidos') |
| app/api/admin/operaciones-resumen/route.ts:202 | SR | .from('pedidos') .select(pedidoSelect).eq('restaurant_id', restaurant.id) .in('estado', ['solicitado', 'pendiente', 'en_preparacion', 'listo']) .order('creado_en', { ascending: false }), supabaseAdmin |
| app/api/admin/operaciones-resumen/route.ts:207 | SR | .from('pedidos') .select(pedidoSelect).eq('restaurant_id', restaurant.id) .in('estado', ['entregado', 'cerrado', 'cancelado']) .order('id', { ascending: false }) .limit(50), |
| app/api/admin/pedidos-operacion/route.ts:25 | SR | const { data, error } = await supabaseAdmin.from('pedidos') .select(id, restaurant_id, mesa_id, creado_en, estado, paga_efectivo, forma_pago, origen, tipo_servicio, medio_pago, estado_pago, efectivo_aprobado, pasado_a_caja, items_pedido(id, cantidad, comentarios, producto:productos(nombre, precio))) .eq('restaurant_id', access.restaurantId).in('estado', active).order('creado_en', { ascending: true }); |
| app/api/admin/pedidos-operacion/route.ts:49 | SR | const { data: orders, error: readError } = await supabaseAdmin.from('pedidos').select('id, estado') .eq('restaurant_id', access.restaurantId).in('id', ids).in('estado', active); if (readError) throw readError; if (!orders \|\| orders.length !== new Set(ids).size) return NextResponse.json({ error: 'Pedido no disponible en esta sucursal.' }, { status: 409 }); if (['cocina', 'enviar_cocina', 'cerrar'].includes(action) \|\| (action === 'estado' && body.estado !== 'cancelado')) { |
| app/api/admin/pedidos-operacion/route.ts:54 | SR | const blocked = await supabaseAdmin.from('order_collections').select('order_id').eq('restaurant_id', access.restaurantId) .eq('require_payment', true).neq('state', 'confirmed').in('order_id', ids); if (blocked.error && !['42P01', 'PGRST205'].includes(blocked.error.code)) throw blocked.error; if (blocked.data?.length) return NextResponse.json({ error: 'El comercio exige confirmar el pago antes de preparar el pedido.' }, { status: 409 }); } |
| app/api/admin/pedidos-operacion/route.ts:60 | SR | const { data: items, error } = await supabaseAdmin.from('items_pedido').select('id, comentarios').eq('pedido_id', ids[0]); if (error) throw error; if (body.itemId != null && !items?.some(item => item.id === body.itemId)) return NextResponse.json({ error: 'Ítem no disponible en este pedido.' }, { status: 409 }); for (const item of items ?? []) { if (body.itemId != null && item.id !== body.itemId) continue; |
| app/api/admin/pedidos-operacion/route.ts:71 | SR | let update = supabaseAdmin.from('items_pedido').update({ comentarios: [[COCINA:${state}]]${comment ?  ${comment} : ''} }).eq('id', item.id).eq('pedido_id', ids[0]); update = item.comentarios === null ? update.is('comentarios', null) : update.eq('comentarios', item.comentarios); const result = await update.select('id'); if (result.error) throw result.error; if (!result.data?.length) return NextResponse.json({ error: 'El ítem cambió. Actualizá y reintentá.' }, { status: 409 }); |
| app/api/admin/pedidos-operacion/route.ts:79 | SR | const result = await supabaseAdmin.from('pedidos').update(payload).eq('restaurant_id', access.restaurantId).in('id', ids).in('estado', active).select('id'); if (result.error) throw result.error; if (result.data?.length !== new Set(ids).size) return NextResponse.json({ error: 'Los pedidos cambiaron. Actualizá la pantalla.' }, { status: 409 }); return NextResponse.json({ ok: true }); } catch { |
| app/api/admin/productos/route.ts:20 | SR | const { data: configs, error: configError } = await supabaseAdmin.from('producto_restaurantes') .select('producto_id, restaurant_id, visible_en_menu, control_stock, stock_actual, permitir_sin_stock') .eq('restaurant_id', access.restaurant!.id); if (configError) throw configError; if (!configs?.length) return NextResponse.json([]); |
| app/api/admin/productos/route.ts:25 | SR | const { data: products, error } = await supabaseAdmin.from('productos') .select('id, nombre, descripcion, precio, categoria, disponible, imagen_url, control_stock, stock_actual, permitir_sin_stock, marca_id') .in('id', configs.map(row => row.producto_id)) .order('categoria', { ascending: true }).order('nombre', { ascending: true }); if (error) throw error; |
| app/api/admin/productos/[id]/imagenes/route.ts:28 | SR | const { data, error } = await supabaseAdmin.from('producto_imagenes') .select('id, producto_id, image_url, storage_path, es_portada, orden') .eq('producto_id', auth.id).order('orden', { ascending: true }).order('id', { ascending: true }); if (error) return NextResponse.json({ error: 'No se pudieron cargar las imágenes.' }, { status: 500 }); return NextResponse.json(data ?? []); |
| app/api/admin/productos/[id]/imagenes/route.ts:39 | SR | const { data: image, error } = await supabaseAdmin.from('producto_imagenes') .select('id, image_url').eq('producto_id', auth.id).eq('id', body.imageId).maybeSingle(); if (error) throw error; if (!image) return NextResponse.json({ error: 'Imagen ajena o inexistente.' }, { status: 404 }); // URL and ownership come from the stored row, never the client. |
| app/api/admin/productos/[id]/imagenes/route.ts:44 | SR | const { error: productError } = await supabaseAdmin.from('productos').update({ imagen_url: image.image_url }).eq('id', auth.id); if (productError) throw productError; const { error: resetError } = await supabaseAdmin.from('producto_imagenes').update({ es_portada: false }).eq('producto_id', auth.id); if (resetError) throw resetError; const { error: coverError } = await supabaseAdmin.from('producto_imagenes').update({ es_portada: true }).eq('producto_id', auth.id).eq('id', image.id); |
| app/api/admin/productos/[id]/imagenes/route.ts:46 | SR | const { error: resetError } = await supabaseAdmin.from('producto_imagenes').update({ es_portada: false }).eq('producto_id', auth.id); if (resetError) throw resetError; const { error: coverError } = await supabaseAdmin.from('producto_imagenes').update({ es_portada: true }).eq('producto_id', auth.id).eq('id', image.id); if (coverError) throw coverError; return NextResponse.json({ ok: true }); |
| app/api/admin/productos/[id]/imagenes/route.ts:48 | SR | const { error: coverError } = await supabaseAdmin.from('producto_imagenes').update({ es_portada: true }).eq('producto_id', auth.id).eq('id', image.id); if (coverError) throw coverError; return NextResponse.json({ ok: true }); } catch { return NextResponse.json({ error: 'No se pudo actualizar la portada.' }, { status: 500 }); |
| app/api/admin/productos/[id]/imagenes/route.ts:62 | SR | const bucket = supabaseAdmin.storage.from('productos'); const { error: uploadError } = await bucket.upload(path, image.bytes, { contentType: image.mime, upsert: false }); if (uploadError) throw uploadError; const url = bucket.getPublicUrl(path).data.publicUrl; const { data, error } = await supabaseAdmin.from('producto_imagenes').insert({ producto_id: auth.id, image_url: url, storage_path: path, es_portada: false, orden: null }).select('id, producto_id, image_url, storage_path, es_portada, orden').single(); |
| app/api/admin/productos/[id]/imagenes/route.ts:66 | SR | const { data, error } = await supabaseAdmin.from('producto_imagenes').insert({ producto_id: auth.id, image_url: url, storage_path: path, es_portada: false, orden: null }).select('id, producto_id, image_url, storage_path, es_portada, orden').single(); // An uncertain DB result may have committed: retain the object for reconciliation. if (error \|\| !data) throw new Error('metadata'); return NextResponse.json(data, { status: 201 }); } catch (error) { return NextResponse.json({ error: error instanceof ImageInputError ? error.message : 'No se pudo guardar la imagen. Recargue antes de reintentar.' }, { status: error instanceof ImageInputError ? 400 : 500 }); } |
| app/api/admin/productos/[id]/imagenes/route.ts:78 | SR | const { data: image, error } = await supabaseAdmin.from('producto_imagenes').select('id, image_url').eq('producto_id', auth.id).eq('id', body.imageId).maybeSingle(); if (error) throw error; if (!image) return NextResponse.json({ error: 'Imagen no disponible.' }, { status: 404 }); const { error: coverError } = await supabaseAdmin.from('productos').update({ imagen_url: null }).eq('id', auth.id).eq('imagen_url', image.image_url); if (coverError) throw coverError; |
| app/api/admin/productos/[id]/imagenes/route.ts:81 | SR | const { error: coverError } = await supabaseAdmin.from('productos').update({ imagen_url: null }).eq('id', auth.id).eq('imagen_url', image.image_url); if (coverError) throw coverError; const { error: deleteError } = await supabaseAdmin.from('producto_imagenes').delete().eq('producto_id', auth.id).eq('id', image.id); if (deleteError) throw deleteError; return NextResponse.json({ ok: true, storageCleanup: 'deferred' }); |
| app/api/admin/productos/[id]/imagenes/route.ts:83 | SR | const { error: deleteError } = await supabaseAdmin.from('producto_imagenes').delete().eq('producto_id', auth.id).eq('id', image.id); if (deleteError) throw deleteError; return NextResponse.json({ ok: true, storageCleanup: 'deferred' }); } catch { return NextResponse.json({ error: 'No se pudo quitar la imagen. Recargue para verificar el estado.' }, { status: 500 }); } } |
| app/api/admin/restaurants/route.ts:159 | SR | .from('restaurants') .select( 'id, slug, plan, owner_tenant_id, estado, cerrado_en, cerrado_motivo' ) .eq('owner_tenant_id', ownerTenantId) |
| app/api/admin/restaurants/route.ts:177 | SR | .from('configuracion_local') .select( 'restaurant_id, nombre_local, direccion, telefono, celular, email, horario_atencion, business_mode' ) .in('restaurant_id', restaurantIds) |
| app/api/admin/restaurants/route.ts:288 | SR | .from('restaurants') .select('id', { count: 'exact', head: true }) .eq('owner_tenant_id', ownerTenantId) .eq('estado', 'activo');  |
| app/api/admin/restaurants/route.ts:311 | SR | .from('restaurants') .select('id, slug') .eq('slug', slug) .maybeSingle();  |
| app/api/admin/restaurants/route.ts:326 | SR | .from('restaurants') .insert({ slug, plan: technicalPlanFallback, owner_tenant_id: ownerTenantId, |
| app/api/admin/restaurants/route.ts:341 | SR | .from('configuracion_local') .insert({ restaurant_id: restaurant.id, nombre_local: nombreLocal, direccion: normalizeNonEmptyString(body?.direccion) ?? '', |
| app/api/admin/restaurants/route.ts:357 | SR | await supabaseAdmin.from('restaurants').delete().eq('id', restaurant.id); throw configError; }  return NextResponse.json( |
| app/api/admin/restaurants/route.ts:428 | SR | .from('restaurants') .select('id, slug, owner_tenant_id, estado') .limit(1);  if (restaurantId) { |
| app/api/admin/restaurants/route.ts:463 | SR | .from('restaurants') .update({ estado: 'cerrado', cerrado_en: cerradoEn, cerrado_motivo: 'Cerrado desde administración', |
| app/api/admin/session/route.ts:138 | SR | .from('admin_users') .select('id, email, tenant_id') .limit(1);  if (adminId) { |
| app/api/categorias/route.ts:119 | SR | .from('categorias') .select('id, nombre, orden, tenant_id') .eq('tenant_id', access.tenantId) .order('orden', { ascending: true }) .order('nombre', { ascending: true }); |
| app/api/categorias/route.ts:166 | SR | .from('categorias') .select('orden') .eq('tenant_id', access.tenantId) .order('orden', { ascending: false }) .limit(1) |
| app/api/categorias/route.ts:178 | SR | .from('categorias') .insert([ { tenant_id: access.tenantId, nombre, |
| app/api/categorias/[id]/route.ts:121 | SR | .from('restaurants') .select('id') .eq('owner_tenant_id', access.tenantId) .neq('estado', 'cerrado');  |
| app/api/categorias/[id]/route.ts:142 | SR | .from('producto_restaurantes') .select('producto_id') .in('restaurant_id', restaurantIds);  if (error) { |
| app/api/categorias/[id]/route.ts:164 | SR | .from('categorias') .select('id, nombre, orden, tenant_id') .eq('tenant_id', access.tenantId) .eq('nombre', FALLBACK_CATEGORY_NAME) .maybeSingle(); |
| app/api/categorias/[id]/route.ts:175 | SR | .from('categorias') .select('orden') .eq('tenant_id', access.tenantId) .order('orden', { ascending: false }) .limit(1) |
| app/api/categorias/[id]/route.ts:187 | SR | .from('categorias') .insert([ { tenant_id: access.tenantId, nombre: FALLBACK_CATEGORY_NAME, |
| app/api/categorias/[id]/route.ts:241 | SR | .from('categorias') .select('id, nombre, orden, tenant_id') .eq('id', categoriaId) .eq('tenant_id', access.tenantId) .maybeSingle(); |
| app/api/categorias/[id]/route.ts:270 | SR | .from('categorias') .update({ nombre }) .eq('id', categoriaId) .eq('tenant_id', access.tenantId) .select('id, nombre, orden, tenant_id') |
| app/api/categorias/[id]/route.ts:293 | SR | .from('productos') .update({ categoria: nombre }) .in('id', productIds) .eq('categoria', nombreAnterior);  |
| app/api/categorias/[id]/route.ts:341 | SR | .from('categorias') .select('id, nombre, orden, tenant_id') .eq('id', categoriaId) .eq('tenant_id', access.tenantId) .maybeSingle(); |
| app/api/categorias/[id]/route.ts:372 | SR | .from('productos') .update({ categoria: FALLBACK_CATEGORY_NAME }) .in('id', productIds) .eq('categoria', categoriaRow.nombre);  |
| app/api/categorias/[id]/route.ts:381 | SR | .from('categorias') .delete() .eq('id', categoriaRow.id) .eq('tenant_id', access.tenantId);  |
| app/api/delivery/pedidos/[id]/estado-efectivo/route.ts:74 | SR | .from('pedidos') .select(  id, estado, |
| app/api/delivery/pedidos/[id]/estado-efectivo/route.ts:176 | SR | .from('pedidos') .update(payload) .eq('id', pedidoId) .eq('restaurant_id', restaurantId) .eq('estado_pago', estadoPago) |
| app/api/pedidos/route.ts:178 | SR | .from('restaurants') .select('id, slug, plan, estado, owner_tenant_id') .eq('slug', slug) .maybeSingle();  |
| app/api/pedidos/route.ts:193 | SR | .from('restaurants') .select('id, slug, plan, estado, owner_tenant_id') .eq('id', id) .maybeSingle();  |
| app/api/pedidos/route.ts:304 | SR | .from('productos') .select('id, nombre, disponible, marca_id, precio') .in('id', productoIds);  if (error) { |
| app/api/pedidos/route.ts:329 | SR | .from('producto_restaurantes') .select( 'producto_id, restaurant_id, visible_en_menu, control_stock, stock_actual, permitir_sin_stock' ) .eq('restaurant_id', restaurantId) |
| app/api/pedidos/route.ts:366 | SR | .from('marcas') .select('id, nombre, color_hex, logo_url') .in('id', marcaIds);  if (error) { |
| app/api/pedidos/route.ts:476 | SR | .from('configuracion_local') .select('business_mode') .eq('restaurant_id', restaurant.id) .order('id', { ascending: true }) .limit(1) |
| app/api/pedidos/route.ts:506 | SR | .from('mesas') .select('id') .eq('restaurant_id', restaurantId) .eq('nombre', '__RESTOSMART_VIRTUAL__') .maybeSingle(); |
| app/api/pedidos/route.ts:546 | SR | .from('mesas') .select('id') .eq('id', rawMesaId) .eq('restaurant_id', restaurantId) .maybeSingle(); |
| app/api/pedidos/route.ts:686 | SR | .from('configuracion_local') .select('nombre_local, direccion') .eq('restaurant_id', ctx.id) .limit(1) .maybeSingle(); |
| app/api/pedidos/route.ts:700 | SR | .from('pedidos') .select(  id, restaurant_id, |
| app/api/pedidos/route.ts:747 | SR | .from('mesas') .select('id, numero, nombre, restaurant_id') .eq('restaurant_id', ctx.id) .gt('id', SIN_MESA_ID) .order('numero', { ascending: true }); |
| app/api/pedidos/route.ts:1106 | SR | const { data: result, error: transactionError } = await supabaseAdmin.rpc( collection.effective ? 'restosmart_create_order_collection_v1' : 'restosmart_create_order_atomic_v1', { ...(collection.effective ? { p_method: paymentMethod } : {}), p_pedido: payloadPedido, |
| app/api/productos/route.ts:214 | SR | .from('marcas') .select('id') .eq('tenant_id', access.tenantId) .eq('activa', true) .order('orden', { ascending: true }) |
| app/api/productos/route.ts:246 | SR | .from('marcas') .select('id') .eq('id', marcaId) .eq('tenant_id', access.tenantId) .eq('activa', true) |
| app/api/productos/route.ts:277 | SR | .from('producto_restaurantes') .select( 'producto_id, restaurant_id, visible_en_menu, control_stock, stock_actual, permitir_sin_stock' ) .eq('restaurant_id', restaurantId) |
| app/api/productos/route.ts:309 | SR | .from('restaurants') .select('id, slug, estado, owner_tenant_id') .eq('owner_tenant_id', access.tenantId) .neq('estado', 'cerrado') .order('slug', { ascending: true }); |
| app/api/productos/route.ts:380 | SR | .from('producto_restaurantes') .delete() .eq('producto_id', productId);  return { |
| app/api/productos/route.ts:404 | SR | .from('producto_restaurantes') .select('restaurant_id, stock_actual') .eq('producto_id', productId) .in('restaurant_id', activeRestaurantIds);  |
| app/api/productos/route.ts:445 | SR | .from('producto_restaurantes') .upsert(rows, { onConflict: 'producto_id,restaurant_id', });  |
| app/api/productos/route.ts:570 | SR | .from('productos') .select(PRODUCTO_SELECT) .order('categoria', { ascending: true }) .order('nombre', { ascending: true });  |
| app/api/productos/route.ts:740 | SR | .from('productos') .insert([payload]) .select(PRODUCTO_SELECT) .single();  |
| app/api/productos/[id]/route.ts:215 | SR | .from('marcas') .select('id') .eq('tenant_id', access.tenantId) .eq('activa', true) .order('orden', { ascending: true }) |
| app/api/productos/[id]/route.ts:247 | SR | .from('marcas') .select('id') .eq('id', marcaId) .eq('tenant_id', access.tenantId) .eq('activa', true) |
| app/api/productos/[id]/route.ts:268 | SR | .from('restaurants') .select('id, slug, estado, owner_tenant_id') .eq('owner_tenant_id', access.tenantId) .neq('estado', 'cerrado') .order('slug', { ascending: true }); |
| app/api/productos/[id]/route.ts:311 | SR | .from('producto_restaurantes') .select( 'producto_id, restaurant_id, visible_en_menu, control_stock, stock_actual, permitir_sin_stock' ) .eq('producto_id', productoId); |
| app/api/productos/[id]/route.ts:380 | SR | .from('producto_restaurantes') .delete() .eq('producto_id', productId);  return { |
| app/api/productos/[id]/route.ts:404 | SR | .from('producto_restaurantes') .select('restaurant_id, stock_actual') .eq('producto_id', productId) .in('restaurant_id', activeRestaurantIds);  |
| app/api/productos/[id]/route.ts:445 | SR | .from('producto_restaurantes') .upsert(rows, { onConflict: 'producto_id,restaurant_id', });  |
| app/api/productos/[id]/route.ts:628 | SR | .from('productos') .update(payload) .eq('id', productoId) .select(PRODUCTO_SELECT) .maybeSingle(); |
| app/api/productos/[id]/route.ts:647 | SR | .from('producto_restaurantes') .select('restaurant_id, visible_en_menu, control_stock, stock_actual, permitir_sin_stock') .eq('producto_id', productoId) .in('restaurant_id', validIds); if (existingError) throw existingError; |
| app/api/productos/[id]/route.ts:682 | SR | .from('producto_restaurantes') .update(changes) .eq('producto_id', productoId) .eq('restaurant_id', restaurantId); if (updateError) throw updateError; |
| app/api/productos/[id]/route.ts:691 | SR | .from('producto_restaurantes') .insert({ producto_id: productoId, restaurant_id: restaurantId, visible_en_menu: changes.visible_en_menu ?? false, |
| app/api/productos/[id]/route.ts:778 | SR | .from('producto_imagenes').select('id').eq('producto_id', productoId).limit(1); if (imagesError) throw imagesError; if (images?.length) { return NextResponse.json( { error: 'El producto tiene imágenes. Su eliminación está bloqueada hasta habilitar la limpieza segura de Storage.' }, |
| app/api/productos/[id]/route.ts:788 | SR | .from('productos') .delete() .eq('id', productoId) .select('id') .maybeSingle(); |
| app/api/productos/[id]/disponible/route.ts:173 | SR | .from('productos') .update({ disponible }) .eq('id', productoId) .select(PRODUCTO_SELECT) .maybeSingle(); |
| app/api/public/cobros/route.ts:10 | SR | const { data, error } = await supabaseAdmin.from('restaurants').select('id,owner_tenant_id,estado').eq('id', id).maybeSingle(); if (error \|\| !data \|\| ['cerrado', 'pausado'].includes(data.estado)) return NextResponse.json({ error: 'Sucursal no disponible.' }, { status: 404 }); const config = await readCollectionConfig(data.owner_tenant_id, String(data.id)); // No payment account is invented for unconfigured restaurants. return NextResponse.json({ config: config.effective }, { headers }); |
| app/api/public/cobros/route.ts:24 | SR | const { data, error } = await supabaseAdmin.from('order_collections').select('order_id,tenant_id,restaurant_id').eq('token', body.token).maybeSingle(); if (error \|\| !data) return NextResponse.json({ error: 'Pago no disponible.' }, { status: 404 }); const result = await supabaseAdmin.rpc('restosmart_collection_action_v1', { p_tenant: data.tenant_id, p_restaurant: data.restaurant_id, p_order: data.order_id, p_token: body.token, p_action: 'declare', p_operator: 'customer', p_note: null }); if (result.error) return NextResponse.json({ error: 'La declaración ya fue registrada o el pago fue resuelto.' }, { status: 409 }); return NextResponse.json({ state: 'declared', message: 'Pendiente de verificación por el comercio.' }, { headers }); |
| app/api/public/cobros/route.ts:26 | SR | const result = await supabaseAdmin.rpc('restosmart_collection_action_v1', { p_tenant: data.tenant_id, p_restaurant: data.restaurant_id, p_order: data.order_id, p_token: body.token, p_action: 'declare', p_operator: 'customer', p_note: null }); if (result.error) return NextResponse.json({ error: 'La declaración ya fue registrada o el pago fue resuelto.' }, { status: 409 }); return NextResponse.json({ state: 'declared', message: 'Pendiente de verificación por el comercio.' }, { headers }); } catch { return NextResponse.json({ error: 'No se pudo registrar la declaración.' }, { status: 400 }); } } |
| app/api/public/contexto/route.ts:10 | SR | const { data: marcas, error } = await supabaseAdmin.from('marcas') .select('id, nombre, descripcion, logo_url, color_hex, activa, orden') .eq('tenant_id', context.restaurant.owner_tenant_id).eq('activa', true) .order('orden', { ascending: true }).order('nombre', { ascending: true }); if (error) throw error; |
| app/api/public/mesa/route.ts:12 | SR | const { data, error } = await supabaseAdmin.from('mesas') .select('id, numero, nombre, restaurant_id').eq('restaurant_id', context.restaurant.id) .eq('numero', numero).gt('id', 0).maybeSingle(); if (error) throw error; if (!data) return NextResponse.json({ error: 'Mesa no encontrada.' }, { status: 404 }); |
| app/api/public/retiro/route.ts:93 | SR | .from('restaurants') .select('id, slug, plan, estado, owner_tenant_id') .eq('id', restaurantId) .maybeSingle();  |
| app/api/public/retiro/route.ts:145 | SR | .from('configuracion_local') .select('nombre_local, business_mode') .eq('restaurant_id', restaurant.id) .order('id', { ascending: true }) .limit(1) |
| app/api/public/retiro/route.ts:153 | SR | .from('pedidos') .select(  id, codigo_publico, |
| app/api/signup/route.ts:52 | SR | .from('restaurants') .select('id') .eq('slug', candidate) .maybeSingle();  |
| app/api/signup/route.ts:112 | SR | .from('admin_users') .select('id') .ilike('email', email) .maybeSingle();  |
| app/api/signup/route.ts:132 | SR | .from('restaurants') .insert({ slug: tenantSlug, plan: selectedPlan, owner_tenant_id: tenantSlug, |
| app/api/signup/route.ts:150 | SR | .from('configuracion_local') .insert({ restaurant_id: primaryRestaurant.id, nombre_local: sucursalNombre, direccion, |
| app/api/signup/route.ts:166 | SR | .from('restaurants') .delete() .eq('id', primaryRestaurant.id); throw configError; } |
| app/api/signup/route.ts:173 | SR | .from('tenant_subscriptions') .insert({ tenant_id: tenantSlug, plan: selectedPlan, status: 'active', |
| app/api/signup/route.ts:186 | SR | .from('configuracion_local') .delete() .eq('restaurant_id', primaryRestaurant.id);  await supabaseAdmin |
| app/api/signup/route.ts:191 | SR | .from('restaurants') .delete() .eq('id', primaryRestaurant.id);  throw subscriptionError; |
| app/api/signup/route.ts:199 | SR | .from('admin_users') .insert({ email, password_hash: hashPassword(password), password: '', |
| app/api/signup/route.ts:212 | SR | .from('tenant_subscriptions') .delete() .eq('tenant_id', tenantSlug);  await supabaseAdmin |
| app/api/signup/route.ts:217 | SR | .from('configuracion_local') .delete() .eq('restaurant_id', primaryRestaurant.id);  await supabaseAdmin |
| app/api/signup/route.ts:222 | SR | .from('restaurants') .delete() .eq('id', primaryRestaurant.id);  throw adminError ?? new Error('No se pudo crear el usuario administrador.'); |
| app/api/stats/route.ts:17 | SR | .from('productos') .select('id, categoria, disponible') .order('categoria', { ascending: true }) .order('id', { ascending: true });  |
| app/api/webhooks/mercadopago/route.ts:145 | SR | .from('billing_checkout_sessions') .select( 'id, tenant_id, restaurant_id, kind, target_plan, addon_key, status, external_reference, amount, currency, mp_preference_id' ) .eq('external_reference', externalReference) |
| app/api/webhooks/mercadopago/route.ts:208 | SR | const { data: result, error: rpcError } = await supabaseAdmin.rpc( 'restosmart_apply_billing_payment_v1', { p_external_reference: session.external_reference, p_payment_id: String(payment?.id ?? paymentId), |
| lib/adminAccess.ts:126 | SR | .from('restaurants') .select('id, slug, plan, owner_tenant_id, estado') .eq('slug', slug) .maybeSingle();  |
| lib/adminAccess.ts:142 | SR | .from('restaurants') .select('id, slug, plan, owner_tenant_id, estado') .eq('id', restaurantId) .maybeSingle();  |
| lib/adminAccess.ts:159 | SR | .from('restaurants') .select('id, slug, plan, owner_tenant_id, estado') .order('id', { ascending: true }) .limit(1) .maybeSingle(); |
| lib/adminAccess.ts:217 | SR | .from('tenant_subscriptions') .select('tenant_id, plan, status') .eq('tenant_id', tenantId) .maybeSingle();  |
| lib/adminAccess.ts:250 | SR | .from('whatsapp_connections') .select('tenant_id, add_on_enabled') .eq('tenant_id', tenantId) .order('id', { ascending: true }) .limit(1) |
| lib/adminAccess.ts:270 | SR | .from('tenant_addons') .select('addon_key, enabled') .eq('tenant_id', tenantId);  if (result.error) { |
| lib/adminAccess.ts:302 | SR | .from('configuracion_local') .select('business_mode') .eq('restaurant_id', restaurantId) .order('id', { ascending: true }) .limit(1) |
| lib/adminProductAccess.ts:7 | SR | const { data: link, error } = await supabaseAdmin.from('producto_restaurantes') .select('producto_id').eq('producto_id', productId) .eq('restaurant_id', access.restaurant.id).maybeSingle(); if (error) throw error; if (!link) return false; |
| lib/adminProductAccess.ts:12 | SR | const { data: product, error: productError } = await supabaseAdmin.from('productos') .select('id, marca_id').eq('id', productId).maybeSingle(); if (productError) throw productError; if (!product) return false; // Global product rows must not be writable through a link shared across tenants. |
| lib/adminProductAccess.ts:17 | SR | const { data: links, error: linksError } = await supabaseAdmin.from('producto_restaurantes') .select('restaurant_id').eq('producto_id', productId); if (linksError) throw linksError; const restaurantIds = [...new Set((links ?? []).map(row => String(row.restaurant_id)))]; const { data: restaurants, error: restaurantsError } = await supabaseAdmin.from('restaurants') |
| lib/adminProductAccess.ts:21 | SR | const { data: restaurants, error: restaurantsError } = await supabaseAdmin.from('restaurants') .select('id, owner_tenant_id').in('id', restaurantIds); if (restaurantsError) throw restaurantsError; if (restaurants?.length !== restaurantIds.length \|\| restaurants.some(row => row.owner_tenant_id !== access.tenantId)) return false; if (product.marca_id) { |
| lib/adminProductAccess.ts:26 | SR | const { data: brand, error: brandError } = await supabaseAdmin.from('marcas') .select('id').eq('id', product.marca_id).eq('tenant_id', access.tenantId).maybeSingle(); if (brandError) throw brandError; if (!brand) return false; } |
| lib/authorizedAdminAccess.ts:27 | SR | .from('admin_users') .select('id, email, tenant_id, activo');  const byId = adminId.toLowerCase() !== email.toLowerCase(); const { data: admin, error: adminError } = await ( |
| lib/authorizedAdminAccess.ts:53 | SR | .from('restaurants') .select('id, slug, owner_tenant_id, estado') .eq('owner_tenant_id', tenantId);  if (restaurantId) { |
| lib/deliveryBot.ts:92 | SR | .from('restaurants') .select('id, slug') .eq('id', restaurantId) .maybeSingle();  |
| lib/deliveryBot.ts:112 | SR | .from('restaurants') .select('id, slug') .eq('slug', restaurantSlug) .maybeSingle();  |
| lib/deliveryBot.ts:126 | SR | .from('restaurants') .select('id, slug') .eq('slug', defaultTenantId) .maybeSingle();  |
| lib/deliveryBot.ts:137 | SR | .from('restaurants') .select('id, slug') .order('id', { ascending: true }) .limit(1) .maybeSingle(); |
| lib/deliveryBot.ts:258 | SR | .from('configuracion_delivery') .select('*');  if (restaurantId != null) { query = query.eq('restaurant_id', restaurantId); |
| lib/deliveryBot.ts:283 | SR | .from('delivery_conversaciones') .select('*') .eq('telefono', telefono);  if (restaurantId != null) { |
| lib/deliveryBot.ts:304 | SR | .from('delivery_conversaciones') .insert({ telefono, restaurant_id: restaurantId, estado: 'inicio', |
| lib/deliveryBot.ts:325 | SR | .from('delivery_conversaciones') .update({ ...patch, updated_at: new Date().toISOString(), }) |
| lib/deliveryBot.ts:341 | SR | .from('productos') .select('id, nombre, precio, disponible') .ilike('nombre', %${name}%) .eq('disponible', true) .order('nombre', { ascending: true }) |
| lib/deliveryBot.ts:358 | SR | .from('productos') .select('id, nombre, precio') .eq('disponible', true) .order('id', { ascending: true });  |
| lib/deliveryBot.ts:377 | SR | .from('pedidos') .select('id, mesa_id, estado, estado_pago, codigo_publico') .eq('cliente_telefono', telefono) .eq('medio_pago', 'mercadopago') .eq('origen', 'delivery_whatsapp') |
| lib/deliveryBot.ts:446 | SR | .from('pedidos') .insert(payload) .select('id, mesa_id, estado, estado_pago, codigo_publico') .single();  |
| lib/deliveryBot.ts:460 | SR | .from('pedidos') .update({ codigo_publico: codigoPublico }) .eq('id', pedido.id);  if (errorCodigo) { |
| lib/deliveryBot.ts:465 | SR | await supabaseAdmin.from('pedidos').delete().eq('id', pedido.id); throw new Error( errorCodigo.message \|\| 'No se pudo asignar el código público del pedido.' ); } |
| lib/deliveryBot.ts:479 | SR | .from('items_pedido') .insert(items);  if (errorItems) { await supabaseAdmin.from('pedidos').delete().eq('id', pedido.id); |
| lib/deliveryBot.ts:483 | SR | await supabaseAdmin.from('pedidos').delete().eq('id', pedido.id); throw new Error( errorItems.message \|\| 'No se pudieron guardar los ítems del pedido.' ); } |
| lib/publicOrderingContext.ts:7 | SR | const { data: restaurant, error } = await supabaseAdmin.from('restaurants') .select('id, owner_tenant_id, estado').eq('id', restaurantId).maybeSingle(); if (error) throw error; if (!restaurant?.owner_tenant_id \|\| ['cerrado', 'pausado'].includes(String(restaurant.estado).trim().toLowerCase())) return null; const { data: config, error: configError } = await supabaseAdmin.from('configuracion_local') |
| lib/publicOrderingContext.ts:11 | SR | const { data: config, error: configError } = await supabaseAdmin.from('configuracion_local') .select('nombre_local, direccion, horario_atencion, business_mode') .eq('restaurant_id', restaurant.id).limit(1).maybeSingle(); if (configError) throw configError; return { restaurant, config }; |
| lib/supabaseAdmin.ts:16 | SR | export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false, }, |
| lib/supabaseClient.ts:6 | PUB | export const supabase = createClient(supabaseUrl, supabaseAnonKey); |
| lib/tenant.ts:20 | PARAM/SR | return createClient(url, key, { auth: { persistSession: false }, }); }  |
| lib/tenant.ts:81 | PARAM/SR | .from('restaurants') .select('id, slug, plan, owner_tenant_id, estado') .eq('slug', slug) .maybeSingle();  |
| lib/tenant.ts:98 | PARAM/SR | .from('restaurants') .select('id, slug, plan, owner_tenant_id, estado') .eq('id', id) .maybeSingle();  |
| lib/tenant.ts:173 | PARAM/SR | .from('restaurants') .select('id, slug, plan, owner_tenant_id, estado') .order('id', { ascending: true }) .limit(1) .maybeSingle(); |
| lib/whatsapp.ts:85 | SR | .from('whatsapp_connections') .select('*') .eq('phone_number_id', phoneNumberId) .maybeSingle();  |
| lib/whatsapp.ts:101 | SR | .from('whatsapp_connections') .update({ status: 'error', last_error: message, updated_at: new Date().toISOString(), |
| lib/whatsapp.ts:118 | SR | .from('whatsapp_connections') .update({ status: 'connected', last_error: null, updated_at: new Date().toISOString(), |
| lib/cobros/kitchen.ts:6 | SR | const { data, error } = await supabaseAdmin.from('order_collections').select('order_id').eq('restaurant_id', restaurantId) .eq('require_payment', true).neq('state', 'confirmed').in('order_id', orders.map(order => order.id)); if (error && ['42P01', 'PGRST205'].includes(error.code)) return orders; if (error) throw error; const blocked = new Set(data?.map(row => row.order_id)); |
| lib/cobros/server.ts:6 | SR | const { data, error } = await supabaseAdmin.from('order_collection_configs').select('scope, config') .eq('tenant_id', tenantId).in('scope', ['tenant', restaurant:${restaurantId}]); // Existing installations continue only when the relation is genuinely absent. if (error && ['42P01', 'PGRST205'].includes(error.code)) return { tenant: null, branch: null, effective: null }; if (error) throw error; |

## Anexo B — Todas las rutas HTTP y barreras locales

La presencia de un control no certifica autorización correcta (ver H1/H8). Rutas sin DB directa pueden acceder por helpers del anexo A. Los fragmentos registran métodos, mecanismos de autorización y respuestas deshabilitadas.

| Archivo:línea | Entrada/control |
| --- | --- |
| app/api/admin/addons/route.ts:99 | return await resolveAuthorizedAdminAccess(session as AdminSession, requestedContext); |
| app/api/admin/addons/route.ts:106 | export async function GET(request: NextRequest) { |
| app/api/admin/addons/route.ts:107 | const auth = requireAdminAuth(request); |
| app/api/admin/addons/route.ts:114 | if (!access) return NextResponse.json({ error: 'Acceso denegado.' }, { status: 403 }); |
| app/api/admin/addons/route.ts:166 | export async function PUT(request: NextRequest) { |
| app/api/admin/addons/route.ts:167 | const auth = requireAdminAuth(request); |
| app/api/admin/addons/route.ts:174 | if (!access) return NextResponse.json({ error: 'Acceso denegado.' }, { status: 403 }); |
| app/api/admin/analytics/route.ts:1482 | export async function GET(request: NextRequest) { |
| app/api/admin/analytics/route.ts:1483 | const auth = requireAdminAuth(request); |
| app/api/admin/analytics/route.ts:1494 | access = await resolveAuthorizedAdminAccess(auth.session, requestedContext); |
| app/api/admin/analytics/route.ts:1497 | return NextResponse.json({ error: 'Acceso denegado.' }, { status: 403 }); |
| app/api/admin/analytics/route.ts:1508 | { status: 403 } |
| app/api/admin/billing/checkout/route.ts:175 | return await resolveAuthorizedAdminAccess(session as AdminSession, requestedContext); |
| app/api/admin/billing/checkout/route.ts:202 | export async function POST(request: NextRequest) { |
| app/api/admin/billing/checkout/route.ts:203 | const auth = requireAdminAuth(request); |
| app/api/admin/billing/checkout/route.ts:220 | if (!access) return NextResponse.json({ error: 'Acceso denegado.' }, { status: 403 }); |
| app/api/admin/cobros/route.ts:10 | const auth = requireAdminAuth(request); |
| app/api/admin/cobros/route.ts:13 | const access = await resolveAuthorizedAdminAccess(auth.session, { |
| app/api/admin/cobros/route.ts:19 | } catch { return { response: NextResponse.json({ error: 'Acceso denegado.' }, { status: 403 }) }; } |
| app/api/admin/cobros/route.ts:21 | export async function GET(request: NextRequest) { |
| app/api/admin/cobros/route.ts:33 | export async function POST(request: NextRequest) { |
| app/api/admin/cobros/route.ts:35 | if (request.headers.get('origin') && request.headers.get('origin') !== request.nextUrl.origin) return NextResponse.json({ error: 'Origen denegado.' }, { status: 403 }); |
| app/api/admin/delivery-config/route.ts:7 | export async function GET() { |
| app/api/admin/delivery-config/route.ts:10 | { status: 404 } |
| app/api/admin/delivery-config/route.ts:14 | export async function PUT() { |
| app/api/admin/delivery-config/route.ts:17 | { status: 404 } |
| app/api/admin/delivery-pedidos-pendientes/route.ts:9 | export async function GET(request: NextRequest) { |
| app/api/admin/delivery-pedidos-pendientes/route.ts:10 | const auth = requireAdminAuth(request); |
| app/api/admin/delivery-pedidos-pendientes/route.ts:26 | const access = await resolveAuthorizedAdminAccess( |
| app/api/admin/delivery-pedidos-pendientes/route.ts:34 | { status: 403 } |
| app/api/admin/delivery-pedidos-pendientes/route.ts:42 | { status: 403 } |
| app/api/admin/local-config/route.ts:117 | return await resolveAuthorizedAdminAccess(session as AdminSession, requestedContext); |
| app/api/admin/local-config/route.ts:170 | export async function GET(request: NextRequest) { |
| app/api/admin/local-config/route.ts:171 | const auth = requireAdminAuth(request); |
| app/api/admin/local-config/route.ts:204 | export async function PUT(request: NextRequest) { |
| app/api/admin/local-config/route.ts:205 | const auth = requireAdminAuth(request); |
| app/api/admin/login/route.ts:17 | export async function POST(request: NextRequest) { |
| app/api/admin/login/route.ts:61 | { status: 403 } |
| app/api/admin/logout/route.ts:7 | export async function POST() { |
| app/api/admin/marcas/route.ts:125 | return await resolveAuthorizedAdminAccess(session as AdminSession, requestedContext); |
| app/api/admin/marcas/route.ts:146 | { status: 403 } |
| app/api/admin/marcas/route.ts:231 | export async function GET(request: NextRequest) { |
| app/api/admin/marcas/route.ts:232 | const auth = requireAdminAuth(request); |
| app/api/admin/marcas/route.ts:288 | export async function POST(request: NextRequest) { |
| app/api/admin/marcas/route.ts:289 | const auth = requireAdminAuth(request); |
| app/api/admin/marcas/[id]/route.ts:116 | return await resolveAuthorizedAdminAccess(session as AdminSession, requestedContext); |
| app/api/admin/marcas/[id]/route.ts:137 | { status: 403 } |
| app/api/admin/marcas/[id]/route.ts:199 | export async function PUT(request: NextRequest, { params }: Params) { |
| app/api/admin/marcas/[id]/route.ts:200 | const auth = requireAdminAuth(request); |
| app/api/admin/marcas/[id]/route.ts:242 | { status: 404 } |
| app/api/admin/marcas/[id]/route.ts:304 | { status: 404 } |
| app/api/admin/marcas/[id]/route.ts:318 | export async function DELETE(request: NextRequest, { params }: Params) { |
| app/api/admin/marcas/[id]/route.ts:319 | const auth = requireAdminAuth(request); |
| app/api/admin/marcas/[id]/route.ts:344 | { status: 404 } |
| app/api/admin/marcas/[id]/route.ts:381 | { status: 404 } |
| app/api/admin/marcas/[id]/logo/route.ts:9 | export async function POST(request: NextRequest, { params }: Params) { |
| app/api/admin/marcas/[id]/logo/route.ts:10 | const session = requireAdminAuth(request); |
| app/api/admin/marcas/[id]/logo/route.ts:13 | try { access = await resolveAuthorizedAdminAccess(session.session, { restaurantId: request.nextUrl.searchParams.get('restaurantId'), tenantSlug: request.nextUrl.searchParams.get('tenant') }); } |
| app/api/admin/marcas/[id]/logo/route.ts:14 | catch { return NextResponse.json({ error: 'Acceso denegado.' }, { status: 403 }); } |
| app/api/admin/marcas/[id]/logo/route.ts:15 | if ((!access.capabilities?.multi_brand && !access.addons?.multi_brand) \|\| access.plan === 'esencial') return NextResponse.json({ error: 'Multimarca no disponible.' }, { status: 403 }); |
| app/api/admin/marcas/[id]/logo/route.ts:18 | if (lookupError \|\| !brand) return NextResponse.json({ error: 'Marca no disponible.' }, { status: 404 }); |
| app/api/admin/mesas/route.ts:92 | return await resolveAuthorizedAdminAccess(session as AdminSession, requestedContext); |
| app/api/admin/mesas/route.ts:141 | export async function GET(request: NextRequest) { |
| app/api/admin/mesas/route.ts:142 | const auth = requireAdminAuth(request); |
| app/api/admin/mesas/route.ts:210 | export async function POST(request: NextRequest) { |
| app/api/admin/mesas/route.ts:211 | const auth = requireAdminAuth(request); |
| app/api/admin/operaciones-resumen/route.ts:164 | export async function GET(request: NextRequest) { |
| app/api/admin/operaciones-resumen/route.ts:165 | const auth = requireAdminAuth(request); |
| app/api/admin/operaciones-resumen/route.ts:173 | access = await resolveAuthorizedAdminAccess(auth.session, { restaurantId: request.nextUrl.searchParams.get('restaurantId') ?? request.nextUrl.searchParams.get('restaurant_id') }); |
| app/api/admin/operaciones-resumen/route.ts:174 | } catch { return NextResponse.json({ error: 'Acceso denegado.' }, { status: 403 }); } |
| app/api/admin/operaciones-resumen/route.ts:176 | if (!restaurant) return NextResponse.json({ error: 'Acceso denegado.' }, { status: 403 }); |
| app/api/admin/pedidos-operacion/route.ts:10 | const auth = requireAdminAuth(request); |
| app/api/admin/pedidos-operacion/route.ts:13 | const access = await resolveAuthorizedAdminAccess(auth.session, { |
| app/api/admin/pedidos-operacion/route.ts:19 | return { ok: false as const, response: NextResponse.json({ error: 'Acceso al restaurante denegado.' }, { status: 403 }) }; |
| app/api/admin/pedidos-operacion/route.ts:22 | export async function GET(request: NextRequest) { |
| app/api/admin/pedidos-operacion/route.ts:35 | export async function POST(request: NextRequest) { |
| app/api/admin/pedidos-operacion/route.ts:38 | const origin = request.headers.get('origin'); |
| app/api/admin/pedidos-operacion/route.ts:39 | if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: 'Origen no permitido.' }, { status: 403 }); |
| app/api/admin/plan/route.ts:73 | export async function GET(request: NextRequest) { |
| app/api/admin/plan/route.ts:74 | const auth = requireAdminAuth(request); |
| app/api/admin/plan/route.ts:85 | access = await resolveAuthorizedAdminAccess(auth.session, requestedContext); |
| app/api/admin/plan/route.ts:88 | return NextResponse.json({ error: 'Acceso no autorizado.' }, { status: 403 }); |
| app/api/admin/plan/route.ts:101 | export async function PUT(request: NextRequest) { |
| app/api/admin/plan/route.ts:102 | const auth = requireAdminAuth(request); |
| app/api/admin/plan/route.ts:142 | access = await resolveAuthorizedAdminAccess(auth.session, requestedContext); |
| app/api/admin/productos/route.ts:7 | export async function GET(request: NextRequest) { |
| app/api/admin/productos/route.ts:8 | const auth = requireAdminAuth(request); |
| app/api/admin/productos/route.ts:12 | access = await resolveAuthorizedAdminAccess(auth.session, { |
| app/api/admin/productos/route.ts:17 | return NextResponse.json({ error: 'Acceso denegado.' }, { status: 403 }); |
| app/api/admin/productos/[id]/imagenes/route.ts:11 | const auth = requireAdminAuth(request); |
| app/api/admin/productos/[id]/imagenes/route.ts:14 | const access = await resolveAuthorizedAdminAccess(auth.session, { |
| app/api/admin/productos/[id]/imagenes/route.ts:19 | if (!await ownsProductInRestaurant(id, access)) return { response: NextResponse.json({ error: 'Producto no disponible para esta sucursal.' }, { status: 404 }) }; |
| app/api/admin/productos/[id]/imagenes/route.ts:22 | return { response: NextResponse.json({ error: 'Acceso denegado.' }, { status: 403 }) }; |
| app/api/admin/productos/[id]/imagenes/route.ts:25 | export async function GET(request: NextRequest, { params }: Params) { |
| app/api/admin/productos/[id]/imagenes/route.ts:34 | export async function PUT(request: NextRequest, { params }: Params) { |
| app/api/admin/productos/[id]/imagenes/route.ts:42 | if (!image) return NextResponse.json({ error: 'Imagen ajena o inexistente.' }, { status: 404 }); |
| app/api/admin/productos/[id]/imagenes/route.ts:55 | export async function POST(request: NextRequest, { params }: Params) { |
| app/api/admin/productos/[id]/imagenes/route.ts:72 | export async function DELETE(request: NextRequest, { params }: Params) { |
| app/api/admin/productos/[id]/imagenes/route.ts:80 | if (!image) return NextResponse.json({ error: 'Imagen no disponible.' }, { status: 404 }); |
| app/api/admin/restaurants/route.ts:111 | return await resolveAuthorizedAdminAccess(session as AdminSession, { tenantSlug }); |
| app/api/admin/restaurants/route.ts:137 | export async function GET(req: NextRequest) { |
| app/api/admin/restaurants/route.ts:138 | const auth = requireAdminAuth(req); |
| app/api/admin/restaurants/route.ts:149 | { status: 403 } |
| app/api/admin/restaurants/route.ts:246 | export async function POST(req: NextRequest) { |
| app/api/admin/restaurants/route.ts:247 | const auth = requireAdminAuth(req); |
| app/api/admin/restaurants/route.ts:258 | { status: 403 } |
| app/api/admin/restaurants/route.ts:305 | { status: 403 } |
| app/api/admin/restaurants/route.ts:391 | export async function DELETE(req: NextRequest) { |
| app/api/admin/restaurants/route.ts:392 | const auth = requireAdminAuth(req); |
| app/api/admin/restaurants/route.ts:403 | { status: 403 } |
| app/api/admin/restaurants/route.ts:446 | { status: 404 } |
| app/api/admin/session/route.ts:162 | export async function GET(request: NextRequest) { |
| app/api/admin/session/route.ts:163 | const auth = requireAdminAuth(request); |
| app/api/admin/session/route.ts:174 | { status: 403 } |
| app/api/admin/session/route.ts:186 | access = await resolveAdminAccess({ |
| app/api/admin/session/route.ts:210 | { status: 403 } |
| app/api/admin/session/route.ts:220 | { status: 403 } |
| app/api/admin/session/route.ts:231 | { status: 403 } |
| app/api/admin/whatsapp-connection/route.ts:8 | export async function GET() { |
| app/api/admin/whatsapp-connection/route.ts:11 | { status: 404 } |
| app/api/admin/whatsapp-connection/route.ts:15 | export async function PUT() { |
| app/api/admin/whatsapp-connection/route.ts:18 | { status: 404 } |
| app/api/categorias/route.ts:94 | return await resolveAuthorizedAdminAccess(session as AdminSession, requestedContext); |
| app/api/categorias/route.ts:101 | export async function GET(req: NextRequest) { |
| app/api/categorias/route.ts:102 | const auth = requireAdminAuth(req); |
| app/api/categorias/route.ts:138 | export async function POST(req: NextRequest) { |
| app/api/categorias/route.ts:139 | const auth = requireAdminAuth(req); |
| app/api/categorias/[id]/route.ts:112 | return await resolveAuthorizedAdminAccess(session as AdminSession, requestedContext); |
| app/api/categorias/[id]/route.ts:203 | export async function PUT(req: NextRequest, { params }: Params) { |
| app/api/categorias/[id]/route.ts:204 | const auth = requireAdminAuth(req); |
| app/api/categorias/[id]/route.ts:252 | { status: 404 } |
| app/api/categorias/[id]/route.ts:313 | export async function DELETE(req: NextRequest, { params }: Params) { |
| app/api/categorias/[id]/route.ts:314 | const auth = requireAdminAuth(req); |
| app/api/categorias/[id]/route.ts:352 | { status: 404 } |
| app/api/delivery/pedidos/[id]/aprobar-efectivo/route.ts:9 | export async function POST() { |
| app/api/delivery/pedidos/[id]/aprobar-efectivo/route.ts:12 | { status: 403 } |
| app/api/delivery/pedidos/[id]/estado-efectivo/route.ts:11 | export async function POST( |
| app/api/delivery/pedidos/[id]/estado-efectivo/route.ts:15 | const auth = requireAdminAuth(request); |
| app/api/delivery/pedidos/[id]/estado-efectivo/route.ts:31 | const access = await resolveAuthorizedAdminAccess( |
| app/api/delivery/pedidos/[id]/estado-efectivo/route.ts:41 | { status: 403 } |
| app/api/delivery/pedidos/[id]/estado-efectivo/route.ts:49 | { status: 403 } |
| app/api/delivery/pedidos/[id]/estado-efectivo/route.ts:102 | { status: 404 } |
| app/api/pagos/crear-preferencia/route.ts:8 | export async function POST() { |
| app/api/pagos/crear-preferencia/route.ts:11 | { status: 404 } |
| app/api/pagos/webhook/route.ts:8 | export async function POST() { |
| app/api/pagos/webhook/route.ts:11 | { status: 404 } |
| app/api/pedidos/route.ts:645 | export async function GET(request: NextRequest) { |
| app/api/pedidos/route.ts:648 | const auth = requireAdminAuth(request); |
| app/api/pedidos/route.ts:666 | const access = await resolveAuthorizedAdminAccess(auth.session, { |
| app/api/pedidos/route.ts:673 | { status: 403 } |
| app/api/pedidos/route.ts:679 | { status: 403 } |
| app/api/pedidos/route.ts:789 | export async function POST(request: NextRequest) { |
| app/api/productos/route.ts:526 | export async function GET(req: NextRequest) { |
| app/api/productos/route.ts:552 | { status: 403 } |
| app/api/productos/route.ts:620 | export async function POST(req: NextRequest) { |
| app/api/productos/route.ts:621 | const auth = requireAdminAuth(req); |
| app/api/productos/route.ts:630 | access = await resolveAuthorizedAdminAccess( |
| app/api/productos/route.ts:638 | { status: 403 } |
| app/api/productos/route.ts:736 | return NextResponse.json({ error: 'Sucursales no autorizadas.' }, { status: 403 }); |
| app/api/productos/[id]/route.ts:186 | return await resolveAuthorizedAdminAccess(session as AdminSession, requestedContext); |
| app/api/productos/[id]/route.ts:476 | return NextResponse.json({ error: 'Producto no encontrado para esta sucursal.' }, { status: 404 }); |
| app/api/productos/[id]/route.ts:481 | export async function PUT(req: NextRequest, { params }: Params) { |
| app/api/productos/[id]/route.ts:482 | const auth = requireAdminAuth(req); |
| app/api/productos/[id]/route.ts:639 | { status: 404 } |
| app/api/productos/[id]/route.ts:747 | export async function DELETE(req: NextRequest, { params }: Params) { |
| app/api/productos/[id]/route.ts:748 | const auth = requireAdminAuth(req); |
| app/api/productos/[id]/route.ts:799 | { status: 404 } |
| app/api/productos/[id]/disponible/route.ts:122 | return await resolveAuthorizedAdminAccess(session as AdminSession, requestedContext); |
| app/api/productos/[id]/disponible/route.ts:131 | return NextResponse.json({ error: 'Producto no encontrado para esta sucursal.' }, { status: 404 }); |
| app/api/productos/[id]/disponible/route.ts:136 | export async function PUT(req: NextRequest, { params }: Params) { |
| app/api/productos/[id]/disponible/route.ts:137 | const auth = requireAdminAuth(req); |
| app/api/productos/[id]/disponible/route.ts:194 | { status: 404 } |
| app/api/public/cobros/route.ts:6 | export async function GET(request: NextRequest) { |
| app/api/public/cobros/route.ts:11 | if (error \|\| !data \|\| ['cerrado', 'pausado'].includes(data.estado)) return NextResponse.json({ error: 'Sucursal no disponible.' }, { status: 404 }); |
| app/api/public/cobros/route.ts:17 | export async function POST(request: NextRequest) { |
| app/api/public/cobros/route.ts:18 | if (request.headers.get('origin') && request.headers.get('origin') !== request.nextUrl.origin) return NextResponse.json({ error: 'Origen denegado.' }, { status: 403 }); |
| app/api/public/cobros/route.ts:25 | if (error \|\| !data) return NextResponse.json({ error: 'Pago no disponible.' }, { status: 404 }); |
| app/api/public/contexto/route.ts:6 | export async function GET(request: NextRequest) { |
| app/api/public/contexto/route.ts:9 | if (!context) return NextResponse.json({ error: 'Sucursal no disponible.' }, { status: 404 }); |
| app/api/public/mesa/route.ts:6 | export async function GET(request: NextRequest) { |
| app/api/public/mesa/route.ts:11 | if (!context \|\| context.config?.business_mode === 'takeaway') return NextResponse.json({ error: 'Sucursal no disponible para mesas.' }, { status: 404 }); |
| app/api/public/mesa/route.ts:16 | if (!data) return NextResponse.json({ error: 'Mesa no encontrada.' }, { status: 404 }); |
| app/api/public/retiro/route.ts:121 | export async function GET(request: NextRequest) { |
| app/api/public/retiro/route.ts:140 | { status: 403 } |
| app/api/signup/route.ts:71 | export async function POST(request: NextRequest) { |
| app/api/stats/route.ts:8 | export async function GET(request: NextRequest) { |
| app/api/stats/route.ts:9 | const auth = requireAdminAuth(request); |
| app/api/webhooks/mercadopago/route.ts:22 | function getSignatureParts(xSignature: string \| null) { |
| app/api/webhooks/mercadopago/route.ts:25 | for (const part of String(xSignature ?? '').split(',')) { |
| app/api/webhooks/mercadopago/route.ts:38 | function verifyMercadoPagoSignature(request: NextRequest, dataId: string \| null) { |
| app/api/webhooks/mercadopago/route.ts:46 | const xSignature = request.headers.get('x-signature'); |
| app/api/webhooks/mercadopago/route.ts:48 | const { ts, v1 } = getSignatureParts(xSignature); |
| app/api/webhooks/mercadopago/route.ts:62 | export async function POST(request: NextRequest) { |
| app/api/webhooks/mercadopago/route.ts:107 | if (!verifyMercadoPagoSignature(request, queryDataId ?? paymentId)) { |
| app/api/webhooks/mercadopago/route.ts:159 | { status: 404 } |
| app/api/whatsapp/webhook/route.ts:8 | export async function GET() { |
| app/api/whatsapp/webhook/route.ts:11 | { status: 404 } |
| app/api/whatsapp/webhook/route.ts:15 | export async function POST() { |
| app/api/whatsapp/webhook/route.ts:18 | { status: 404 } |

## Anexo C — Todas las pantallas y puntos de red cliente

Fetch usa identidad HTTP propia; DB detrás de APIs usa servicio. Única excepción SDK pública encontrada: admin/menu. operateOrder/loadOperationalOrders delegan a lib/orderOperationsClient.ts:9,15. Se incluyen pantallas sin llamadas. Las URLs de imágenes no son escrituras Storage.

| Archivo | Referencias por línea |
| --- | --- |
| app/layout.tsx | Sin SDK/fetch/operaciones; presentación, navegación o componentes hijos. |
| app/page.tsx | Sin SDK/fetch/operaciones; presentación, navegación o componentes hijos. |
| app/admin/layout.tsx | 103: ? /api/admin/session?${restaurantScopeQuery}; 104: : '/api/admin/session';; 106: const res = await fetch(sessionUrl, {; 197: await fetch('/api/admin/logout', { |
| app/admin/page.tsx | Sin SDK/fetch/operaciones; presentación, navegación o componentes hijos. |
| app/admin/analytics/page.tsx | 733: const res = await fetch(/api/admin/analytics?${params.toString()}, {; 795: const previousRes = await fetch(; 796: /api/admin/analytics?${previousParams.toString()},; 851: const res = await fetch('/api/admin/session', { |
| app/admin/cobros/page.tsx | 11: const endpoint = /api/admin/cobros?${params.toString()};; 19: const response = await fetch(endpoint, { cache: 'no-store' }); const body = await response.json();; 32: const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); |
| app/admin/configuracion/page.tsx | 336: const res = await fetch('/api/admin/billing/checkout', {; 545: const res = await fetch(buildTenantApiUrl('/api/admin/addons'), {; 570: const sessionRes = await fetch(buildTenantApiUrl('/api/admin/session'), {; 618: const sessionRes = await fetch(buildTenantApiUrl('/api/admin/session'), {; 640: const localRes = await fetch(buildTenantApiUrl('/api/admin/local-config'), {; 685: const deliveryRes = await fetch(buildTenantApiUrl('/api/admin/delivery-config'), {; 779: const localRes = await fetch(buildTenantApiUrl('/api/admin/local-config'), {; 816: const deliveryRes = await fetch(; 817: buildTenantApiUrl('/api/admin/delivery-config'),; 899: const res = await fetch(buildTenantApiUrl('/api/admin/billing/checkout'), {; 966: const res = await fetch(buildTenantApiUrl('/api/admin/billing/checkout'), { |
| app/admin/delivery/page.tsx | 37: const response = await fetch(; 38: /api/admin/delivery-pedidos-pendientes${query},; 66: const sessionResponse = await fetch('/api/admin/session', {; 113: const response = await fetch(; 114: /api/delivery/pedidos/${id}/estado-efectivo${query}, |
| app/admin/login/page.tsx | 22: const res = await fetch('/api/admin/session', {; 57: const res = await fetch('/api/admin/login', { |
| app/admin/marcas/page.tsx | 123: const res = await fetch('/api/admin/session', {; 147: const res = await fetch('/api/admin/marcas', {; 263: ? /api/admin/marcas/${editandoId}; 264: : '/api/admin/marcas';; 266: const res = await fetch(url, {; 289: const upload = await fetch(/api/admin/marcas/${id}/logo, { method: 'POST', body });; 316: const res = await fetch(/api/admin/marcas/${marca.id}, {; 371: const res = await fetch(/api/admin/marcas/${marca.id}, { |
| app/admin/menu/page.tsx | 92: fetch('/api/admin/session', {; 96: supabase.from('categorias').select('*').order('orden', { ascending: true }),; 98: .from('menu_items'); 185: const { error } = await supabase.from('menu_items').delete().eq('id', item.id);; 211: .from('menu_items'); 257: .from('menu_items') |
| app/admin/mesas/page.tsx | 110: return /api/admin/mesas${query ? ?${query} : ''};; 149: const res = await fetch('/api/admin/session', {; 218: const res = await fetch(buildMesasApiUrl(currentRestaurantId), {; 316: const res = await fetch(buildMesasApiUrl(currentRestaurantId), { |
| app/admin/operaciones/page.tsx | Sin SDK/fetch/operaciones; presentación, navegación o componentes hijos. |
| app/admin/productos/page.tsx | 342: const res = await fetch(buildTenantApiUrl('/api/admin/session'), {; 393: const res = await fetch(buildTenantApiUrl('/api/admin/productos'), {; 404: throw new Error('La respuesta de /api/productos no es válida.');; 428: const res = await fetch(buildTenantApiUrl('/api/categorias'), {; 461: const res = await fetch(buildTenantApiUrl('/api/admin/marcas'), {; 495: const res = await fetch(buildTenantApiUrl('/api/admin/restaurants'), {; 578: const response = await fetch(buildTenantApiUrl(/api/admin/productos/${productoId}/imagenes), { cache: 'no-store' });; 775: const res = await fetch(buildTenantApiUrl('/api/categorias'), {; 821: const res = await fetch(buildTenantApiUrl(/api/categorias/${id}), {; 876: const res = await fetch(buildTenantApiUrl(/api/categorias/${cat.id}), {; 917: const response = await fetch(buildTenantApiUrl(/api/admin/productos/${productoId}/imagenes), { method: 'POST', body });; 931: const response = await fetch(buildTenantApiUrl(/api/admin/productos/${form.id}/imagenes), { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageId }) });; 945: const response = await fetch(buildTenantApiUrl(/api/admin/productos/${productoId}/imagenes), {; 1085: const res = await fetch(buildTenantApiUrl(/api/productos/${form.id}), {; 1106: const res = await fetch(buildTenantApiUrl('/api/productos'), {; 1176: const res = await fetch(buildTenantApiUrl(/api/productos/${id}), {; 1200: const res = await fetch(buildTenantApiUrl(/api/productos/${p.id}/disponible), { |
| app/admin/restaurantes/page.tsx | 120: const res = await fetch('/api/admin/restaurants', {; 176: const res = await fetch('/api/admin/restaurants', {; 215: const res = await fetch(; 216: /api/admin/restaurants?restaurantId=${encodeURIComponent(item.id)}, |
| app/cocina/page.tsx | 312: () => buildScopedHref('/api/pedidos', restaurantScopeQuery),; 357: const res = await fetch('/api/admin/session', {; 474: const res = await fetch(pedidosEndpoint, {; 612: const result = await operateOrder(currentRestaurantId, { action: 'cocina', pedidoId: pedido.id, estado: nuevoEstado }); |
| app/demo/DemoClient.tsx | Sin SDK/fetch/operaciones; presentación, navegación o componentes hijos. |
| app/demo/page.tsx | Sin SDK/fetch/operaciones; presentación, navegación o componentes hijos. |
| app/inicio/page.tsx | 417: await fetch('/api/admin/logout', {; 440: fetch('/api/admin/session', {; 445: fetch('/api/admin/restaurants', { |
| app/login/page.tsx | Sin SDK/fetch/operaciones; presentación, navegación o componentes hijos. |
| app/mesa/[mesaId]/page.tsx | 21: const response = await fetch(/api/public/mesa?restaurantId=${encodeURIComponent(restaurantId)}&numero=${numero}, { cache: 'no-store' });; 122: '/api/productos?soloDisponibles=1',; 129: () => buildScopedEndpoint('/api/pedidos', restaurantScopeQuery),; 177: const productosRes = await fetch(productosEndpoint, {; 240: const productosPromise = fetch(productosEndpoint, {; 397: const res = await fetch(pedidosEndpoint, { |
| app/mesa/[mesaId]/cuenta/page.tsx | 62: const { data: orders, error } = await loadOperationalOrders(scope.get('restaurantId') ?? scope.get('restaurant_id')).catch(() => ({ data: null, error: new Error('Sin conexión') }));; 116: const { error } = await operateOrder(scope.get('restaurantId') ?? scope.get('restaurant_id'), { action: 'cerrar', pedidoIds: ids }); |
| app/mostrador/page.tsx | 720: const res = await fetch('/api/admin/session', {; 779: const res = await fetch('/api/admin/restaurants', {; 845: const pedidosPromise = fetch(/api/pedidos?${restaurantScopeQuery}, {; 854: const productosPromise = fetch(/api/productos?${productosQuery.toString()}, {; 861: ? fetch('/api/admin/marcas', {; 1384: const { error: updateError } = await operateOrder(currentRestaurantId, { action: 'estado', pedidoId, estado: nuevoEstado });; 1405: const { error: updateError } = await operateOrder(currentRestaurantId, { action: 'enviar_cocina', pedidoId, itemId: item.id });; 1431: const result = await operateOrder(currentRestaurantId, { action: 'enviar_cocina', pedidoId: pedido.id });; 1464: const { error: updateError } = await operateOrder(currentRestaurantId, { action: 'cerrar', pedidoIds: ids });; 1527: const res = await fetch(/api/pedidos?${restaurantScopeQuery}, { |
| app/mozo/mesas/page.tsx | 265: return /api/admin/mesas${query ? ?${query} : ''};; 330: const res = await fetch('/api/admin/session', {; 625: const qrResponse = await fetch(qrUrl);; 718: const mesasRes = await fetch(buildMesasApiUrl(currentRestaurantId), {; 746: const { data: pedidosData, error: errorPedidos } = await loadOperationalOrders(currentRestaurantId);; 981: const { error } = await operateOrder(currentRestaurantId, { action: 'caja', pedidoIds: idsPedidos });; 1009: const { error } = await operateOrder(currentRestaurantId, { action: 'estado', pedidoId, estado: 'cancelado' });; 1028: const { error } = await operateOrder(currentRestaurantId, { action: 'estado', pedidoId, estado: nuevoEstado });; 1045: const { error: itemError } = await operateOrder(currentRestaurantId, { action: 'enviar_cocina', pedidoId, itemId: item.id }); |
| app/mozo/mesas/[mesaId]/page.tsx | 187: return /api/admin/mesas${query ? ?${query} : ''};; 246: const res = await fetch(buildMesasApiUrl(currentRestaurantId), {; 307: const result = await loadOperationalOrders(currentRestaurantId);; 354: const res = await fetch('/api/admin/session', {; 429: const { error } = await operateOrder(currentRestaurantId, { action: 'estado', pedidoId, estado: nuevoEstado });; 446: const { error: itemError } = await operateOrder(currentRestaurantId, { action: 'enviar_cocina', pedidoId, itemId: item.id });; 467: const { error } = await operateOrder(currentRestaurantId, { action: 'caja', pedidoIds: pedidos.map(pedido => pedido.id) }); |
| app/pedir/page.tsx | 253: buildPublicEndpoint('/api/productos?soloDisponibles=1', {; 261: buildPublicEndpoint('/api/pedidos', {; 318: const res = await fetch(productosEndpoint, {; 362: fetch(/api/public/contexto?restaurantId=${encodeURIComponent(restaurantId ?? '')}, { cache: 'no-store' }),; 363: fetch(productosEndpoint, { cache: 'no-store' }),; 579: const res = await fetch(pedidosEndpoint, {; 628: const res = await fetch(pedidosEndpoint, { |
| app/retiro/page.tsx | 119: ? /api/public/retiro?${retiroQueryString}; 120: : '/api/public/retiro',; 131: const res = await fetch(retiroApiPath, { |
| app/signup/page.tsx | 96: const res = await fetch('/api/admin/session', {; 147: const res = await fetch('/api/signup', { |
| components/CollectionCheckout.tsx | 11: fetch(/api/public/cobros?restaurantId=${encodeURIComponent(restaurantId)}, { cache: 'no-store' }).then(async response => {; 35: const response = await fetch('/api/public/cobros', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: payment!.token }) }); |
| components/TakeAwayQrCard.tsx | Sin SDK/fetch/operaciones; presentación, navegación o componentes hijos. |

## Anexo D — SQL local: objetos, identidad, grants y transacciones

Son definiciones y ensayos del repositorio, no catálogo remoto. Archivo b722t preexistente preservado, excluido como prueba de instalación.

| Archivo:línea | Definición/control |
| --- | --- |
| qa/b5/restosmart_create_order_atomic_b52_DRAFT.sql:5 | CREATE OR REPLACE FUNCTION public.restosmart_create_order_atomic_v1( |
| qa/b5/restosmart_create_order_atomic_b52_DRAFT.sql:12 | SECURITY INVOKER |
| qa/b5/restosmart_create_order_atomic_b52_DRAFT.sql:200 | REVOKE ALL ON FUNCTION public.restosmart_create_order_atomic_v1(jsonb, jsonb, boolean) |
| qa/b5/restosmart_create_order_atomic_b52_DRAFT.sql:202 | GRANT EXECUTE ON FUNCTION public.restosmart_create_order_atomic_v1(jsonb, jsonb, boolean) |
| qa/b7/b719f_mesas_virtuales.sql:84 | COMMIT; |
| qa/b7/b722q_billing_atomic_DRAFT.sql:8 | CREATE OR REPLACE FUNCTION public.restosmart_apply_billing_payment_v1( |
| qa/b7/b722q_billing_atomic_DRAFT.sql:17 | SECURITY INVOKER |
| qa/b7/b722q_billing_atomic_DRAFT.sql:173 | REVOKE ALL ON FUNCTION public.restosmart_apply_billing_payment_v1( |
| qa/b7/b722q_billing_atomic_DRAFT.sql:177 | GRANT EXECUTE ON FUNCTION public.restosmart_apply_billing_payment_v1( |
| qa/b7/b724_order_collections_DRAFT.sql:10 | ALTER TABLE public.pedidos ADD COLUMN moneda_cobro text CHECK (moneda_cobro IS NULL OR moneda_cobro = 'ARS'); |
| qa/b7/b724_order_collections_DRAFT.sql:38 | ALTER TABLE public.order_collection_configs ENABLE ROW LEVEL SECURITY; |
| qa/b7/b724_order_collections_DRAFT.sql:39 | ALTER TABLE public.order_collections ENABLE ROW LEVEL SECURITY; |
| qa/b7/b724_order_collections_DRAFT.sql:40 | ALTER TABLE public.order_collection_events ENABLE ROW LEVEL SECURITY; |
| qa/b7/b724_order_collections_DRAFT.sql:41 | REVOKE ALL ON public.order_collection_configs, public.order_collections, public.order_collection_events FROM PUBLIC, anon, authenticated; |
| qa/b7/b724_order_collections_DRAFT.sql:42 | GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_collection_configs TO service_role; |
| qa/b7/b724_order_collections_DRAFT.sql:43 | GRANT SELECT, INSERT, UPDATE ON public.order_collections TO service_role; |
| qa/b7/b724_order_collections_DRAFT.sql:44 | GRANT SELECT, INSERT ON public.order_collection_events TO service_role; |
| qa/b7/b724_order_collections_DRAFT.sql:45 | REVOKE ALL ON SEQUENCE public.order_collection_events_id_seq FROM PUBLIC, anon, authenticated; |
| qa/b7/b724_order_collections_DRAFT.sql:46 | GRANT USAGE, SELECT ON SEQUENCE public.order_collection_events_id_seq TO service_role; |
| qa/b7/b724_order_collections_DRAFT.sql:48 | CREATE FUNCTION public.b724_order_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$ |
| qa/b7/b724_order_collections_DRAFT.sql:77 | CREATE TRIGGER b724_order_guard BEFORE INSERT OR UPDATE ON public.pedidos FOR EACH ROW EXECUTE FUNCTION public.b724_order_guard(); |
| qa/b7/b724_order_collections_DRAFT.sql:79 | CREATE FUNCTION public.b724_order_snapshot() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$ |
| qa/b7/b724_order_collections_DRAFT.sql:94 | CREATE TRIGGER b724_order_snapshot AFTER INSERT ON public.pedidos FOR EACH ROW EXECUTE FUNCTION public.b724_order_snapshot(); |
| qa/b7/b724_order_collections_DRAFT.sql:96 | CREATE FUNCTION public.b724_item_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$ |
| qa/b7/b724_order_collections_DRAFT.sql:110 | CREATE TRIGGER b724_item_guard BEFORE UPDATE ON public.items_pedido FOR EACH ROW EXECUTE FUNCTION public.b724_item_guard(); |
| qa/b7/b724_order_collections_DRAFT.sql:112 | CREATE FUNCTION public.restosmart_create_order_collection_v1(p_pedido jsonb,p_items jsonb,p_control_stock boolean,p_method text) |
| qa/b7/b724_order_collections_DRAFT.sql:113 | RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$ |
| qa/b7/b724_order_collections_DRAFT.sql:128 | CREATE FUNCTION public.restosmart_collection_action_v1(p_tenant text,p_restaurant bigint,p_order bigint,p_token uuid,p_action text,p_operator text,p_note text DEFAULT NULL) |
| qa/b7/b724_order_collections_DRAFT.sql:129 | RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$ |
| qa/b7/b724_order_collections_DRAFT.sql:157 | CREATE FUNCTION public.restosmart_collection_config_v1(p_tenant text,p_restaurant bigint,p_scope text,p_config jsonb,p_operator text) |
| qa/b7/b724_order_collections_DRAFT.sql:158 | RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$ |
| qa/b7/b724_order_collections_DRAFT.sql:172 | REVOKE ALL ON FUNCTION public.b724_order_guard(), public.b724_order_snapshot(), public.b724_item_guard() FROM PUBLIC,anon,authenticated; |
| qa/b7/b724_order_collections_DRAFT.sql:173 | REVOKE ALL ON FUNCTION public.restosmart_create_order_collection_v1(jsonb,jsonb,boolean,text), public.restosmart_collection_action_v1(text,bigint,bigint,uuid,text,text,text), public.restosmart_collection_config_v1(text,bigint,text,jsonb,text) FROM PUBLIC,anon,authenticated; |
| qa/b7/b724_order_collections_DRAFT.sql:174 | GRANT EXECUTE ON FUNCTION public.b724_order_guard(), public.b724_order_snapshot(), public.b724_item_guard(), public.restosmart_create_order_collection_v1(jsonb,jsonb,boolean,text), public.restosmart_collection_action_v1(text,bigint,bigint,uuid,text,text,text), public.restosmart_collection_config_v1(text,bigint,text,jsonb,text) TO service_role; |
| qa/b7/b724_order_collections_DRAFT.sql:175 | COMMIT; |
| qa/b7/b724_order_collections_ROLLBACK.sql:14 | REVOKE ALL ON SCHEMA b724_archive FROM PUBLIC, anon, authenticated; |
| qa/b7/b724_order_collections_ROLLBACK.sql:15 | ALTER TABLE public.order_collection_configs SET SCHEMA b724_archive; |
| qa/b7/b724_order_collections_ROLLBACK.sql:16 | ALTER TABLE public.order_collections SET SCHEMA b724_archive; |
| qa/b7/b724_order_collections_ROLLBACK.sql:17 | ALTER TABLE public.order_collection_events SET SCHEMA b724_archive; |
| qa/b7/b724_order_collections_ROLLBACK.sql:18 | REVOKE ALL ON ALL TABLES IN SCHEMA b724_archive FROM PUBLIC, anon, authenticated, service_role; |
| qa/b7/b724_order_collections_ROLLBACK.sql:20 | COMMIT; |
| qa/b7/b729_order_collections_TEST_ROLLBACK.sql:2 | SET LOCAL lock_timeout = '3s'; |
| qa/b7/b729_order_collections_TEST_ROLLBACK.sql:3 | SET LOCAL statement_timeout = '30s'; |
| qa/b7/b729_order_collections_TEST_ROLLBACK.sql:12 | ALTER TABLE public.pedidos ADD COLUMN moneda_cobro text CHECK (moneda_cobro IS NULL OR moneda_cobro = 'ARS'); |
| qa/b7/b729_order_collections_TEST_ROLLBACK.sql:40 | ALTER TABLE public.order_collection_configs ENABLE ROW LEVEL SECURITY; |
| qa/b7/b729_order_collections_TEST_ROLLBACK.sql:41 | ALTER TABLE public.order_collections ENABLE ROW LEVEL SECURITY; |
| qa/b7/b729_order_collections_TEST_ROLLBACK.sql:42 | ALTER TABLE public.order_collection_events ENABLE ROW LEVEL SECURITY; |
| qa/b7/b729_order_collections_TEST_ROLLBACK.sql:43 | REVOKE ALL ON public.order_collection_configs, public.order_collections, public.order_collection_events FROM PUBLIC, anon, authenticated; |
| qa/b7/b729_order_collections_TEST_ROLLBACK.sql:44 | GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_collection_configs TO service_role; |
| qa/b7/b729_order_collections_TEST_ROLLBACK.sql:45 | GRANT SELECT, INSERT, UPDATE ON public.order_collections TO service_role; |
| qa/b7/b729_order_collections_TEST_ROLLBACK.sql:46 | GRANT SELECT, INSERT ON public.order_collection_events TO service_role; |
| qa/b7/b729_order_collections_TEST_ROLLBACK.sql:47 | REVOKE ALL ON SEQUENCE public.order_collection_events_id_seq FROM PUBLIC, anon, authenticated; |
| qa/b7/b729_order_collections_TEST_ROLLBACK.sql:48 | GRANT USAGE, SELECT ON SEQUENCE public.order_collection_events_id_seq TO service_role; |
| qa/b7/b729_order_collections_TEST_ROLLBACK.sql:50 | CREATE FUNCTION public.b724_order_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$ |
| qa/b7/b729_order_collections_TEST_ROLLBACK.sql:79 | CREATE TRIGGER b724_order_guard BEFORE INSERT OR UPDATE ON public.pedidos FOR EACH ROW EXECUTE FUNCTION public.b724_order_guard(); |
| qa/b7/b729_order_collections_TEST_ROLLBACK.sql:81 | CREATE FUNCTION public.b724_order_snapshot() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$ |
| qa/b7/b729_order_collections_TEST_ROLLBACK.sql:96 | CREATE TRIGGER b724_order_snapshot AFTER INSERT ON public.pedidos FOR EACH ROW EXECUTE FUNCTION public.b724_order_snapshot(); |
| qa/b7/b729_order_collections_TEST_ROLLBACK.sql:98 | CREATE FUNCTION public.b724_item_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$ |
| qa/b7/b729_order_collections_TEST_ROLLBACK.sql:112 | CREATE TRIGGER b724_item_guard BEFORE UPDATE ON public.items_pedido FOR EACH ROW EXECUTE FUNCTION public.b724_item_guard(); |
| qa/b7/b729_order_collections_TEST_ROLLBACK.sql:114 | CREATE FUNCTION public.restosmart_create_order_collection_v1(p_pedido jsonb,p_items jsonb,p_control_stock boolean,p_method text) |
| qa/b7/b729_order_collections_TEST_ROLLBACK.sql:115 | RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$ |
| qa/b7/b729_order_collections_TEST_ROLLBACK.sql:130 | CREATE FUNCTION public.restosmart_collection_action_v1(p_tenant text,p_restaurant bigint,p_order bigint,p_token uuid,p_action text,p_operator text,p_note text DEFAULT NULL) |
| qa/b7/b729_order_collections_TEST_ROLLBACK.sql:131 | RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$ |
| qa/b7/b729_order_collections_TEST_ROLLBACK.sql:159 | CREATE FUNCTION public.restosmart_collection_config_v1(p_tenant text,p_restaurant bigint,p_scope text,p_config jsonb,p_operator text) |
| qa/b7/b729_order_collections_TEST_ROLLBACK.sql:160 | RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$ |
| qa/b7/b729_order_collections_TEST_ROLLBACK.sql:174 | REVOKE ALL ON FUNCTION public.b724_order_guard(), public.b724_order_snapshot(), public.b724_item_guard() FROM PUBLIC,anon,authenticated; |
| qa/b7/b729_order_collections_TEST_ROLLBACK.sql:175 | REVOKE ALL ON FUNCTION public.restosmart_create_order_collection_v1(jsonb,jsonb,boolean,text), public.restosmart_collection_action_v1(text,bigint,bigint,uuid,text,text,text), public.restosmart_collection_config_v1(text,bigint,text,jsonb,text) FROM PUBLIC,anon,authenticated; |
| qa/b7/b729_order_collections_TEST_ROLLBACK.sql:176 | GRANT EXECUTE ON FUNCTION public.b724_order_guard(), public.b724_order_snapshot(), public.b724_item_guard(), public.restosmart_create_order_collection_v1(jsonb,jsonb,boolean,text), public.restosmart_collection_action_v1(text,bigint,bigint,uuid,text,text,text), public.restosmart_collection_config_v1(text,bigint,text,jsonb,text) TO service_role; |
| qa/b7/b729_order_collections_TEST_ROLLBACK.sql:240 | IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid=('public.'\|\|rel)::regclass) |
| qa/b7/b729_order_collections_TEST_ROLLBACK.sql:293 | ROLLBACK; |
| qa/b7/b730_order_collections_INTEGRATION_ROLLBACK.sql:2 | SET LOCAL lock_timeout = '3s'; |
| qa/b7/b730_order_collections_INTEGRATION_ROLLBACK.sql:3 | SET LOCAL statement_timeout = '40s'; |
| qa/b7/b730_order_collections_INTEGRATION_ROLLBACK.sql:26 | ALTER TABLE public.pedidos ADD COLUMN moneda_cobro text CHECK (moneda_cobro IS NULL OR moneda_cobro = 'ARS'); |
| qa/b7/b730_order_collections_INTEGRATION_ROLLBACK.sql:54 | ALTER TABLE public.order_collection_configs ENABLE ROW LEVEL SECURITY; |
| qa/b7/b730_order_collections_INTEGRATION_ROLLBACK.sql:55 | ALTER TABLE public.order_collections ENABLE ROW LEVEL SECURITY; |
| qa/b7/b730_order_collections_INTEGRATION_ROLLBACK.sql:56 | ALTER TABLE public.order_collection_events ENABLE ROW LEVEL SECURITY; |
| qa/b7/b730_order_collections_INTEGRATION_ROLLBACK.sql:57 | REVOKE ALL ON public.order_collection_configs, public.order_collections, public.order_collection_events FROM PUBLIC, anon, authenticated; |
| qa/b7/b730_order_collections_INTEGRATION_ROLLBACK.sql:58 | GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_collection_configs TO service_role; |
| qa/b7/b730_order_collections_INTEGRATION_ROLLBACK.sql:59 | GRANT SELECT, INSERT, UPDATE ON public.order_collections TO service_role; |
| qa/b7/b730_order_collections_INTEGRATION_ROLLBACK.sql:60 | GRANT SELECT, INSERT ON public.order_collection_events TO service_role; |
| qa/b7/b730_order_collections_INTEGRATION_ROLLBACK.sql:61 | REVOKE ALL ON SEQUENCE public.order_collection_events_id_seq FROM PUBLIC, anon, authenticated; |
| qa/b7/b730_order_collections_INTEGRATION_ROLLBACK.sql:62 | GRANT USAGE, SELECT ON SEQUENCE public.order_collection_events_id_seq TO service_role; |
| qa/b7/b730_order_collections_INTEGRATION_ROLLBACK.sql:64 | CREATE FUNCTION public.b724_order_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$ |
| qa/b7/b730_order_collections_INTEGRATION_ROLLBACK.sql:93 | CREATE TRIGGER b724_order_guard BEFORE INSERT OR UPDATE ON public.pedidos FOR EACH ROW EXECUTE FUNCTION public.b724_order_guard(); |
| qa/b7/b730_order_collections_INTEGRATION_ROLLBACK.sql:95 | CREATE FUNCTION public.b724_order_snapshot() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$ |
| qa/b7/b730_order_collections_INTEGRATION_ROLLBACK.sql:110 | CREATE TRIGGER b724_order_snapshot AFTER INSERT ON public.pedidos FOR EACH ROW EXECUTE FUNCTION public.b724_order_snapshot(); |
| qa/b7/b730_order_collections_INTEGRATION_ROLLBACK.sql:112 | CREATE FUNCTION public.b724_item_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$ |
| qa/b7/b730_order_collections_INTEGRATION_ROLLBACK.sql:126 | CREATE TRIGGER b724_item_guard BEFORE UPDATE ON public.items_pedido FOR EACH ROW EXECUTE FUNCTION public.b724_item_guard(); |
| qa/b7/b730_order_collections_INTEGRATION_ROLLBACK.sql:128 | CREATE FUNCTION public.restosmart_create_order_collection_v1(p_pedido jsonb,p_items jsonb,p_control_stock boolean,p_method text) |
| qa/b7/b730_order_collections_INTEGRATION_ROLLBACK.sql:129 | RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$ |
| qa/b7/b730_order_collections_INTEGRATION_ROLLBACK.sql:144 | CREATE FUNCTION public.restosmart_collection_action_v1(p_tenant text,p_restaurant bigint,p_order bigint,p_token uuid,p_action text,p_operator text,p_note text DEFAULT NULL) |
| qa/b7/b730_order_collections_INTEGRATION_ROLLBACK.sql:145 | RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$ |
| qa/b7/b730_order_collections_INTEGRATION_ROLLBACK.sql:173 | CREATE FUNCTION public.restosmart_collection_config_v1(p_tenant text,p_restaurant bigint,p_scope text,p_config jsonb,p_operator text) |
| qa/b7/b730_order_collections_INTEGRATION_ROLLBACK.sql:174 | RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$ |
| qa/b7/b730_order_collections_INTEGRATION_ROLLBACK.sql:188 | REVOKE ALL ON FUNCTION public.b724_order_guard(), public.b724_order_snapshot(), public.b724_item_guard() FROM PUBLIC,anon,authenticated; |
| qa/b7/b730_order_collections_INTEGRATION_ROLLBACK.sql:189 | REVOKE ALL ON FUNCTION public.restosmart_create_order_collection_v1(jsonb,jsonb,boolean,text), public.restosmart_collection_action_v1(text,bigint,bigint,uuid,text,text,text), public.restosmart_collection_config_v1(text,bigint,text,jsonb,text) FROM PUBLIC,anon,authenticated; |
| qa/b7/b730_order_collections_INTEGRATION_ROLLBACK.sql:190 | GRANT EXECUTE ON FUNCTION public.b724_order_guard(), public.b724_order_snapshot(), public.b724_item_guard(), public.restosmart_create_order_collection_v1(jsonb,jsonb,boolean,text), public.restosmart_collection_action_v1(text,bigint,bigint,uuid,text,text,text), public.restosmart_collection_config_v1(text,bigint,text,jsonb,text) TO service_role; |
| qa/b7/b730_order_collections_INTEGRATION_ROLLBACK.sql:289 | IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid=('public.'\|\|rel)::regclass) |
| qa/b7/b730_order_collections_INTEGRATION_ROLLBACK.sql:347 | EXECUTE format('SET LOCAL ROLE %I',rol); |
| qa/b7/b730_order_collections_INTEGRATION_ROLLBACK.sql:362 | ROLLBACK; |
| qa/b7/b730_order_collections_INTEGRATION_ROLLBACK.sql:363 | SELECT 'B7.30: fin del archivo tras ROLLBACK; revisar errores y NOTICE. No certifica circuito completo.' AS informacion; |
| qa/b7/b743b_storage_DRAFT.sql:35 | COMMIT; |
| qa/b7/b743b_storage_DRAFT.sql:40 | -- ROLLBACK antes de COMMIT: ROLLBACK; |
| qa/b7/b743b_storage_DRAFT.sql:51 | -- COMMIT; |
| qa/b7/b744b_security_DRAFT.sql:5 | SET LOCAL lock_timeout = '3s'; |
| qa/b7/b744b_security_DRAFT.sql:6 | SET LOCAL statement_timeout = '30s'; |
| qa/b7/b744b_security_DRAFT.sql:45 | REVOKE ALL ON TABLE |
| qa/b7/b744b_security_DRAFT.sql:56 | ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY; |
| qa/b7/b744b_security_DRAFT.sql:57 | ALTER TABLE public.mesas ENABLE ROW LEVEL SECURITY; |
| qa/b7/b744b_security_DRAFT.sql:58 | ALTER TABLE public.productos ENABLE ROW LEVEL SECURITY; |
| qa/b7/b744b_security_DRAFT.sql:59 | ALTER TABLE public.producto_restaurantes ENABLE ROW LEVEL SECURITY; |
| qa/b7/b744b_security_DRAFT.sql:60 | ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY; |
| qa/b7/b744b_security_DRAFT.sql:61 | ALTER TABLE public.items_pedido ENABLE ROW LEVEL SECURITY; |
| qa/b7/b744b_security_DRAFT.sql:62 | ALTER TABLE public.pedido_estados_historial ENABLE ROW LEVEL SECURITY; |
| qa/b7/b744b_security_DRAFT.sql:63 | ALTER TABLE public.producto_imagenes ENABLE ROW LEVEL SECURITY; |
| qa/b7/b744b_security_DRAFT.sql:65 | REVOKE ALL ON SEQUENCE |
| qa/b7/b744b_security_DRAFT.sql:73 | GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE |
| qa/b7/b744b_security_DRAFT.sql:84 | GRANT USAGE,SELECT ON SEQUENCE |
| qa/b7/b744b_security_DRAFT.sql:105 | IF NOT (SELECT relrowsecurity FROM pg_class |
| qa/b7/b744b_security_DRAFT.sql:124 | ROLLBACK; |
| qa/b7/b744b_security_LOCAL_ROLLBACK.sql:2 | SET LOCAL lock_timeout='3s'; |
| qa/b7/b744b_security_LOCAL_ROLLBACK.sql:3 | SET LOCAL statement_timeout='30s'; |
| qa/b7/b744b_security_LOCAL_ROLLBACK.sql:16 | GRANT SELECT,INSERT,UPDATE,DELETE ON |
| qa/b7/b744b_security_LOCAL_ROLLBACK.sql:21 | REVOKE ALL ON |
| qa/b7/b744b_security_LOCAL_ROLLBACK.sql:26 | ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY; |
| qa/b7/b744b_security_LOCAL_ROLLBACK.sql:27 | ALTER TABLE public.mesas ENABLE ROW LEVEL SECURITY; |
| qa/b7/b744b_security_LOCAL_ROLLBACK.sql:28 | ALTER TABLE public.productos ENABLE ROW LEVEL SECURITY; |
| qa/b7/b744b_security_LOCAL_ROLLBACK.sql:29 | ALTER TABLE public.producto_restaurantes ENABLE ROW LEVEL SECURITY; |
| qa/b7/b744b_security_LOCAL_ROLLBACK.sql:30 | ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY; |
| qa/b7/b744b_security_LOCAL_ROLLBACK.sql:31 | ALTER TABLE public.items_pedido ENABLE ROW LEVEL SECURITY; |
| qa/b7/b744b_security_LOCAL_ROLLBACK.sql:33 | GRANT SELECT,INSERT,UPDATE,DELETE ON |
| qa/b7/b744b_security_LOCAL_ROLLBACK.sql:45 | IF NOT (SELECT relrowsecurity FROM pg_class |
| qa/b7/b744b_security_LOCAL_ROLLBACK.sql:79 | ROLLBACK; |
| qa/b7/b744d_historial_LOCAL_ROLLBACK.sql:2 | SET LOCAL lock_timeout = '3s'; |
| qa/b7/b744d_historial_LOCAL_ROLLBACK.sql:3 | SET LOCAL statement_timeout = '60s'; |
| qa/b7/b744d_historial_LOCAL_ROLLBACK.sql:39 | CREATE FUNCTION public.log_pedido_estado() |
| qa/b7/b744d_historial_LOCAL_ROLLBACK.sql:64 | CREATE FUNCTION public.set_updated_at() |
| qa/b7/b744d_historial_LOCAL_ROLLBACK.sql:74 | CREATE TRIGGER trg_log_pedido_estado |
| qa/b7/b744d_historial_LOCAL_ROLLBACK.sql:78 | CREATE TRIGGER trg_pedidos_updated_at |
| qa/b7/b744d_historial_LOCAL_ROLLBACK.sql:82 | CREATE TRIGGER trg_items_pedido_updated_at |
| qa/b7/b744d_historial_LOCAL_ROLLBACK.sql:87 | REVOKE ALL ON TABLE |
| qa/b7/b744d_historial_LOCAL_ROLLBACK.sql:93 | ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY; |
| qa/b7/b744d_historial_LOCAL_ROLLBACK.sql:94 | ALTER TABLE public.mesas ENABLE ROW LEVEL SECURITY; |
| qa/b7/b744d_historial_LOCAL_ROLLBACK.sql:95 | ALTER TABLE public.productos ENABLE ROW LEVEL SECURITY; |
| qa/b7/b744d_historial_LOCAL_ROLLBACK.sql:96 | ALTER TABLE public.producto_restaurantes ENABLE ROW LEVEL SECURITY; |
| qa/b7/b744d_historial_LOCAL_ROLLBACK.sql:97 | ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY; |
| qa/b7/b744d_historial_LOCAL_ROLLBACK.sql:98 | ALTER TABLE public.items_pedido ENABLE ROW LEVEL SECURITY; |
| qa/b7/b744d_historial_LOCAL_ROLLBACK.sql:99 | ALTER TABLE public.pedido_estados_historial ENABLE ROW LEVEL SECURITY; |
| qa/b7/b744d_historial_LOCAL_ROLLBACK.sql:101 | GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE |
| qa/b7/b744d_historial_LOCAL_ROLLBACK.sql:107 | GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public |
| qa/b7/b744d_historial_LOCAL_ROLLBACK.sql:164 | SET LOCAL ROLE service_role; |
| qa/b7/b744d_historial_LOCAL_ROLLBACK.sql:232 | ROLLBACK; |
| qa/b7/b746a_integracion_LOCAL_ROLLBACK.sql:3 | SET LOCAL lock_timeout = '3s'; |
| qa/b7/b746a_integracion_LOCAL_ROLLBACK.sql:4 | SET LOCAL statement_timeout = '90s'; |
| qa/b7/b746a_integracion_LOCAL_ROLLBACK.sql:89 | LOCK TABLE public.restaurants,public.mesas,public.productos,public.producto_restaurantes, |
| qa/b7/b746a_integracion_LOCAL_ROLLBACK.sql:123 | EXECUTE format('ALTER SEQUENCE %s RESTART WITH %s',s.name,v + CASE WHEN called THEN s.seqincrement ELSE 0 END); |
| qa/b7/b746a_integracion_LOCAL_ROLLBACK.sql:129 | REVOKE ALL ON SCHEMA b746a_lab FROM PUBLIC; |
| qa/b7/b746a_integracion_LOCAL_ROLLBACK.sql:130 | CREATE FUNCTION b746a_lab.assert_true(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$ |
| qa/b7/b746a_integracion_LOCAL_ROLLBACK.sql:139 | CREATE FUNCTION b746a_lab.log_estado() RETURNS trigger LANGUAGE plpgsql AS $$ |
| qa/b7/b746a_integracion_LOCAL_ROLLBACK.sql:150 | CREATE TRIGGER b746a_historial AFTER INSERT OR UPDATE ON public.pedidos |
| qa/b7/b746a_integracion_LOCAL_ROLLBACK.sql:153 | CREATE FUNCTION b746a_lab.snapshot() RETURNS jsonb LANGUAGE plpgsql AS $$ |
| qa/b7/b746a_integracion_LOCAL_ROLLBACK.sql:164 | CREATE FUNCTION b746a_lab.reject(sql_text text, expected text, label text) RETURNS void LANGUAGE plpgsql AS $$ |
| qa/b7/b746a_integracion_LOCAL_ROLLBACK.sql:196 | CREATE FUNCTION b746a_lab.create_order(r bigint, m bigint, p bigint, price numeric, method text) RETURNS bigint LANGUAGE plpgsql AS $$ |
| qa/b7/b746a_integracion_LOCAL_ROLLBACK.sql:318 | ROLLBACK; |
