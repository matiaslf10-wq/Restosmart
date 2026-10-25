# B7.24 — Cobros propios por tenant y sucursal

Fecha: 2026-10-25. Base: `release/restosmart-v0.9-pro-pilot`, HEAD `9088001`.
Cambios locales, sin commit, push, despliegue, cambios de entorno ni SQL remoto.

## Estado y límites de la verificación

Implementación preparada para revisión. **La migración no fue ejecutada ni probada en PostgreSQL.** No hay base local, `psql`, Docker ni CLI Supabase disponibles en PATH. Los proyectos visibles en las conexiones Supabase no incluyen RestoSmart; no se consultaron tablas de proyectos ajenos. No se ejecutó SQL remoto, ni siquiera de lectura. Por ello NO se pudo certificar el esquema desplegado real ni realizar una prueba integrada navegador/API/base.

La inspección se realizó sobre las rutas reales, los tipos utilizados en consultas, el alta de tenants (`owner_tenant_id` recibe el slug) y los borradores SQL existentes. Deben cotejarse contra una copia local del esquema desplegado antes de aplicar esta migración. El archivo conserva la convención `qa/b7/*_DRAFT.sql` del repositorio; no se usó `supabase migration new` porque no está disponible el CLI.

## Arquitectura y autorización

- `order_collection_configs`: configuración por tenant, scope `tenant` o `restaurant:<id>`. La ausencia de override significa herencia completa; un override con `methods: []` deshabilita todos los medios y NO hereda accidentalmente los del tenant.
- `order_collections`: una copia por pedido de medio, instrucciones, política, importe, moneda y estado. Token aleatorio UUID para declarar, separado del código público operativo. El token solo sale en la respuesta de creación; no aparece en listados administrativos ni en URLs.
- `order_collection_events`: historial de creación, declaración, confirmación, incidencia y cambios de configuración, con fecha del servidor y operador. La cuenta de servicio tiene INSERT/SELECT para eventos, sin UPDATE/DELETE.
- `pedidos.moneda_cobro`: columna nullable sin backfill/default para históricos. Los pedidos nuevos con configuración reciben `ARS` en servidor y el registro de cobro toma esa moneda y `NEW.total`. No hay selector de moneda ni importe confiado al navegador.
- Autorización mediante `requireAdminAuth` y `resolveAuthorizedAdminAccess`: cookie firmada, administrador activo y sucursal perteneciente a su tenant. No se agregan roles nuevos ni se interpretan IDs del navegador como autorización. El modelo actual habilita al administrador activo del tenant para sus sucursales; no hay una matriz de permisos de cajero por sucursal en este modelo.
- RLS habilitada en las tres tablas nuevas, sin políticas públicas y con privilegios revocados a PUBLIC/anon/authenticated. La sesión administrativa actual NO es un JWT de Supabase Auth: una política basada únicamente en `auth.uid()` no representaría esta autorización. Acceso exclusivamente desde servidor con service_role y filtros de ámbito. Las RPC nuevas son SECURITY INVOKER y solo ejecutables por service_role. Referencia: [RLS de Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Medios y panel

`/admin/cobros`, accesible en la navegación administrativa y con el contexto de sucursal existente:

- Transferencia: alias o CBU/CVU de 22 dígitos, titular e instrucciones.
- Mercado Pago: link HTTPS propio del comercio, restringido a los dominios admitidos de Mercado Pago y mpago.la.
- Otro proveedor: URL HTTPS externa sin credenciales, IP literal ni host local. Se abre con noopener/noreferrer; el servidor no hace solicitudes a esa URL.
- Efectivo: instrucciones opcionales.
- Configuración tenant o sucursal, herencia y política de cocina. Cada medio se habilita mediante checkbox; los deshabilitados no se guardan en la lista efectiva.
- Revisión de los últimos 100 cobros, confirmación explícita tras verificar cuenta propia/recibir efectivo, incidencias con motivo y últimas 200 acciones de la sucursal. El historial completo permanece en la base; no hay paginación/exportación en esta etapa.

Los links son declarados por el administrador del comercio. Validar sintaxis/dominio no prueba titularidad de la cuenta externa. No se usan credenciales de Mercado Pago de RestoSmart, preferencias de plataforma, conciliación automática ni integraciones bancarias.

## Cliente, pedidos y cocina

Los checkouts de `/pedir`, `/mesa/[mesaId]` y el alta manual de `/mostrador` usan `CollectionMethods`. Se valida nuevamente el medio en servidor. Al crear el pedido se muestran instrucciones y monto del servidor. Transferencia/link externo ofrecen “Ya realicé el pago”. Esta acción siempre se traduce a `declare` en el servidor, ignorando acciones, estados, importes o ámbitos enviados por el navegador.

Estados de cobro separados de preparación:

| Desde | Acción | Hasta |
|---|---|---|
| pending, transferencia/link | cliente declara | declared |
| declared | administrador confirma | confirmed |
| pending, efectivo | administrador recibió efectivo | confirmed |
| pending / declared | administrador informa motivo | incident |
| confirmed / incident | nueva acción | rechazo 409 |

`declared` significa pendiente de verificación. Solo la confirmación administrativa escribe el estado legado `pedidos.estado_pago = aprobado` y, para efectivo, `efectivo_aprobado = true`. Confirmar no cambia el estado de preparación. Un pago con incidencia requiere resolución humana fuera de este piloto; no se permite reabrirlo o cambiar de medio silenciosamente.

La RPC de creación envuelve la RPC atómica existente de pedido/ítems/stock. Usa un lock por tenant compartido con edición de configuración. Los triggers crean el snapshot y auditoría dentro de esa misma transacción. No se sustituye ni modifica la función B5 existente.

Con pago exigido, el pedido nace `solicitado`, se conservan sus marcadores originales de cocina y se ocultan esos marcadores en las respuestas operativas mientras no esté confirmado. La API rechaza operaciones de preparación antes de mutar ítems; los triggers bloquean también transiciones de pedido e ítems. Al confirmar se vuelven visibles los marcadores originales y el personal continúa el flujo normal. Sin pago exigido, preparación sigue funcionando antes de acreditar.

Las revisiones bloquean primero el pedido y luego el registro de cobro; el estado, sincronización legada y auditoría se escriben en una transacción. Confirmaciones simultáneas o acciones contradictorias se rechazan tras volver a verificar el estado bajo lock. La API antigua de aprobación de efectivo no puede saltarse el nuevo circuito para pedidos con snapshot: el trigger rechaza la escritura. Los pedidos históricos sin snapshot conservan su flujo previo.

## Compatibilidad

- No se actualizan pedidos existentes ni se crean snapshots para históricos.
- Configuración ausente mantiene RPC de alta y política legadas. En la interfaz sin configuración se ofrece efectivo como opción heredada; se elimina la salida virtual hacia la URL global de RestoSmart. Para ofrecer transferencia o links debe configurarse el comercio.
- Instalaciones sin las tablas nuevas mantienen el flujo legado solamente ante errores específicos de relación ausente (`42P01`, `PGRST205`). Otros errores fallan cerrado. El panel informa que falta B7.24.
- Con configuración presente, las altas deben elegir un medio habilitado; mostrador también fue adaptado. La cocina/mesa/stock siguen usando sus estructuras actuales.
- No hay cambios en webhooks ni modelos de suscripciones SaaS, claves o .env. Los endpoints de cobro del bot excluidos del piloto siguen excluidos.
- No se incorporan comprobantes: no se encontró infraestructura de almacenamiento privado con reglas verificadas. Tampoco hay carga de archivos pública insegura.

## Migración y rollback preparados, NO ejecutados

Alta: `qa/b7/b724_order_collections_DRAFT.sql`.
Rollback: `qa/b7/b724_order_collections_ROLLBACK.sql`.

Requisitos de revisión en una base **local** con esquema equivalente:

1. Comparar tipos de `restaurants.id`, `owner_tenant_id`, `pedidos.id`, `restaurant_id`, `total`, `estado`, `estado_pago`, `forma_pago`, `efectivo_aprobado`, e `items_pedido.pedido_id/comentarios` con los utilizados por el código.
2. Verificar la definición desplegada de `restosmart_create_order_atomic_v1(jsonb,jsonb,boolean)`, su retorno `pedido/stock_updates` y privilegios. El borrador B5 es una dependencia, no evidencia de instalación remota.
3. Comprobar constraints de estados y triggers existentes y compatibilidad de su orden/ejecución con los nuevos. Confirmar que la API usa exclusivamente su clave de servicio en servidor.
4. Revisar/aplicar localmente, verificar permisos reales de anon/authenticated/service_role, probar RLS y RPC, rollback y concurrencia en dos sesiones. Esta sesión NO hizo ninguno de esos pasos de ejecución SQL.

Para rollback coordinado, revertir primero el código B7.24 sin tocar .env ni webhooks y luego revisar el SQL de rollback. El script quita triggers/RPC nuevos y mueve las tablas a un esquema privado `b724_archive`, conservando evidencia y revocando acceso. Mantiene `moneda_cobro` y los estados de pagos legítimamente confirmados; no reescribe pedidos. Requiere que el esquema de archivo no exista. No usar DROP CASCADE ni borrar registros financieros para volver al código anterior. Restauración posterior requiere una migración específica desde ese archivo: el alta no es idempotente ni se debe reaplicar a ciegas.

## Pruebas locales

Comandos sin conexión a Supabase:

```text
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/eslint/bin/eslint.js components/CollectionCheckout.tsx app/admin/cobros/page.tsx lib/cobros app/api/admin/cobros/route.ts app/api/public/cobros/route.ts
node --test --test-reporter=dot qa/b7/b720e-security-local.mjs qa/b7/b724-cobros-local.mjs qa/b7/b722r-billing-schema-local.mjs qa/b7/b722s-webhook-local.mjs qa/b7/b722v-webhook-state-local.mjs
```

Resultados: TypeScript sin errores; ESLint de archivos nuevos sin errores; 47 pruebas locales aprobadas. Pruebas ejecutan validadores y APIs transpiladas con dependencias simuladas, además de inspección estática de SQL. Cubren herencia, override vacío, URLs, transferencias, estados, sesión ausente, sucursal no autorizada, filtros de tenant/sucursal, operador derivado del servidor, intento público de autoaprobación, conflictos, bloqueo de cocina, fallback solo ante tabla ausente y regresión de SaaS. La suite B720E se adaptó a la dependencia nueva, manteniendo sus aserciones y agregando bloqueo previo a escrituras.

**Estos resultados NO prueban la compilación/ejecución de PL/pgSQL, el comportamiento real de RLS, locks, rollback, ni el flujo navegador/API/base.** La inspección estática tiene ese nombre explícito en las pruebas.

## Pendientes y riesgos para habilitar el piloto

- Validar contra esquema real/local y ejecutar la matriz integrada de dos tenants y dos sucursales, incluyendo RPC directa con roles anon/authenticated, UUID inexistente/ajeno, dos confirmaciones simultáneas y confirmar versus incidencia.
- Probar creación con stock insuficiente y verificar rollback de pedido, snapshot, auditoría y stock; editar configuración durante creación; cambiar política con pedidos existentes; verificar herencia y override vacío en SQL real.
- Probar navegador en mesa, retiro y mostrador, instrucciones, links, declaración, cola bloqueada/desbloqueada, cocina ya existente y aprobación de efectivo histórica.
- Las instrucciones/token se mantienen en memoria de la página; recargar o crear otro pedido reemplaza el recibo visible. No hay recuperación pública por ID de pedido: ante pérdida del recibo, el personal debe asistir al cliente. No se introduce una lectura pública de pedidos por ID para resolverlo.
- La incidencia es terminal en el piloto. Reembolsos, pago parcial, múltiples intentos, comprobantes, recuperación de recibos, paginación y conciliación automática quedan fuera.
- Moneda ARS fijada por servidor para nuevos pedidos configurados. Una expansión multimoneda requiere modelo de precios/pedidos consistente antes de habilitarla.
- Los enlaces externos pueden cambiar destino o redirigir después de guardarlos. La titularidad debe ser verificada por el comercio; la aplicación no conecta cuentas ni recibe fondos.
- El archivo previo `qa/b7/b722t_billing_compile_ROLLBACK.sql`, sin seguimiento al iniciar, se preservó intacto.
