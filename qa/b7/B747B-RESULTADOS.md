# B7.47B — Reparación local de bloqueantes

Fecha: 2026-10-25. HEAD inspeccionado: `3c94886`. Rama conservada: `release/restosmart-v0.9-pro-pilot`.

## Cambios y decisiones

- `app/api/stats/route.ts`: conserva el array id/categoria/disponible. Verifica sesión firmada, administrador vigente y pertenencia de sucursal mediante `resolveAuthorizedAdminAccess`. Los IDs recibidos solo solicitan contexto: la autorización determina el restaurante. Lee asociaciones de `producto_restaurantes` de esa sucursal y consulta exclusivamente esos IDs de productos. Sin asociaciones devuelve array vacío. Respuestas exitosas privadas/no-store.
- `lib/authorizedAdminAccess.ts`: exige `activo === true`; false, null o ausencia de estado activo fallan cerrados. Afecta también los consumidores existentes del helper.
- `app/admin/menu/page.tsx`: elimina todas las consultas Supabase del navegador y los controles de CRUD heredado. Consulta el endpoint privado para mostrar el motivo del bloqueo y conserva una salida al gestor existente `/admin/productos`, pasando el contexto de URL. Ese gestor mantiene sus propias autorizaciones.
- `app/api/admin/menu/route.ts`: nuevo endpoint, GET/POST/PUT/PATCH/DELETE verifican sesión y autorización real antes de responder 409. Anónimos reciben 401 y sucursales ajenas 403. No lee categorías/menu_items/productos ni escribe datos.
- `app/api/admin/pedidos-operacion/route.ts`: parámetro opcional `mesaNumero`, validado como entero positivo. Resuelve `mesas.id` por número y sucursal autorizada antes de consultar pedidos; filtra simultáneamente restaurante y mesa. Número inexistente devuelve 404. Mantiene la respuesta administrativa privada y las operaciones anteriores.
- `lib/orderOperationsClient.ts`: permite solicitar esa selección por número.
- `app/mesa/[mesaId]/cuenta/page.tsx`: interpreta el segmento como número visible del QR y requiere la sucursal explícita del enlace. Delega la resolución al servidor. Elimina la comparación equivocada entre número e ID SQL. Cerrar cuenta continúa usando IDs de pedidos y autorización del servidor.
- `qa/b7/b747b-blockers-local.mjs`: seis grupos de regresión con handlers y autenticación reales.

## Modelo inspeccionado y limitación deliberada H2

El contrato heredado de menu_items tiene id, categoria_id, nombre, descripción, precio, disponible e imagen_url; referencia categorías. No hay definición SQL local de menu_items ni relación verificada con restaurantes o productos. Categorías sí tiene tenant_id en las APIs existentes `/api/categorias` y `/api/categorias/[id]`; productos usa producto_restaurantes y marcas. Que una categoría pertenezca a un tenant no demuestra pertenencia de cada fila heredada a una sucursal. No se inventaron tenant_id/restaurant_id en menu_items ni se consultó el catálogo remoto.

Por ello siguen bloqueadas TODAS las lecturas y escrituras del menú heredado, tanto en UI como en el endpoint. No se ofrece éxito simulado ni se modifica producto global alguno. El gestor existente de productos/categorías sigue disponible; no se migran automáticamente filas heredadas. El bloqueo no equivale a revocar grants de Data API: las ACL/policies de categorias/menu_items y bundles antiguos siguen pendientes del cierre de seguridad separado B747A.

## H7 y contratos

En HEAD 3c94886 la selección de pedidos-operacion YA incluye mesa_id: discrepancia con el hallazgo estático de B747A, que no se modifica. `maskBlockedKitchen` conserva ese campo. Las pruebas comprueban mesa_id numérico (contrato local de MesaRow y consumidores), sin convertir el número visible en ID global. Mozo detalle ya resuelve número dentro de la lista autorizada de mesas; mozo lista agrupa por ID real. No fue necesario editar esas dos pantallas.

La cuenta sigue siendo del personal: no se crea proyección pública ni se abre la API a anónimos. Conserva rutas QR y números visibles con restaurantId/restaurant_id. Un enlace de cuenta sin sucursal muestra el aviso y no lee pedidos. No hay autorización pública segura de cuenta disponible en este alcance.

## Cobertura y método

Las seis pruebas nuevas reutilizan exclusivamente setup del arnés B743, transpilando TypeScript en memoria. Ejecutan requireAdminAuth, HMAC, resolveAuthorizedAdminAccess y handlers reales. Sustituyen DB/query builder, resolveAdminAccess (plan) y NextResponse con fixtures en memoria; neutralizan server-only. No importan SDK Supabase ni entornos existentes. Son llamadas directas a handlers, no HTTP de Next ni integración DB/RLS.

Cubren: stats sin sesión, firma alterada, admin inactivo o estado activo desconocido; productos de tenant A/B y sucursales A/A2; rechazo antes de leer productos ajenos; cinco métodos del menú con 401/403/409 y cero cambios/lecturas de menú; pedidos de dos mesas de A, mismo número en A2 y B, mesa_id numérico y ausencia de otros pedidos; números inválidos/inexistentes; anónimo/sucursal ajena y lote de cierre mixto rechazados antes de mutar. Inspección estática comprueba ausencia de SQL cliente y contratos de cuenta/mozo. No se ejecuta React en navegador: la agrupación de mozo se verifica con proyección del handler y contrato de fuente, no con clicks.

Primera ejecución nueva: falló por omisión de URL en el contexto VM del arnés. Se corrigió la dependencia del arnés y la ejecución posterior pasó 6/6. No se cambió código de negocio para adaptar esos resultados.

## Validaciones ejecutadas

- `node --test qa/b7/b747b-blockers-local.mjs`: 6/6, salida 0.
- Suite previa de ocho archivos (B720E, B722R, B722S, B722V, B724, B742F, B743B, B745A): 95/95, salida 0. B745A conserva 125 solicitudes HTTP por loopback.
- Ejecución final conjunta de los nueve archivos con `node --test`: 101/101, salida 0; cero fallos, omisiones o cancelaciones.
- `node_modules/.bin/tsc.cmd --noEmit`: salida 0 en ambas ejecuciones, incluida la final.
- `git diff --check`: salida 0, incluida la comprobación final. Los archivos nuevos se revisaron además por whitespace.

## Riesgos y límites pendientes

No se certifican catálogo remoto, grants, RLS, triggers, concurrencia ni pertenencia de datos históricos inconsistentes. Stats sigue el modelo de asociación existente producto_restaurantes; no corrige asociaciones corruptas. La cuenta no constituye un comprobante contable con precios históricos: conserva el cálculo existente. La prueba del query builder no emula joins SQL anidados ni certifica integridad referencial. Falta ensayo de navegador con sesiones y base de laboratorio real, autorizado por separado. Admins heredados sin activo=true dejan de tener acceso: decisión fail closed.

Se aplicó revisión de React: hooks incondicionales, fetch de menú cancelable, estado accesible, sin SDK privilegiado en cliente. No se inició servidor Next ni se leyó .env. No hubo SQL local/remoto, Supabase remoto, instalación, commit, push, deploy, cambio de rama, reset/clean/restore. Billing, checkout, webhooks y migraciones existentes no se modificaron. Se preservaron B747A-AUDITORIA.md, B747A-PLAN-CIERRE.md y b722t_billing_compile_ROLLBACK.sql.
