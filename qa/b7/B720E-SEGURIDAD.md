# B7.20E — Seguridad de pedidos

## Alcance y cambios

Trabajo exclusivamente local. No se conectó a Supabase, no se ejecutó SQL, no se instalaron paquetes, no se modificaron credenciales ni `.env`, no se crearon pagos, commits, pushes ni despliegues.

- Cocina: reemplazo de escrituras directas por operaciones autenticadas. Realtime público reemplazado por sondeo cada 5 segundos a `GET /api/pedidos`, que ya valida sesión y pertenencia. Los avisos sonoros y destacados se obtienen comparando instantáneas autorizadas. Los ítems listos se preservan al tomar un pedido; reenviar a cocina no reinicia su estado individual. El servidor conserva los comentarios existentes y aplica comparación del valor anterior para detectar conflictos.
- Mozo y Mostrador: lecturas y mutaciones de pedidos/ítems pasan por endpoints protegidos. Mozo usa sondeo y conserva avisos de pedidos nuevos/listos y solicitudes de efectivo observables en las instantáneas. No quedan suscripciones a las tres tablas en componentes cliente.
- Mesa: se eliminaron las mutaciones de pedidos existentes y la suscripción pública. Sin autorización de cuenta no se modifica masivamente una mesa ni se habilita una API de seguimiento por IDs. El cliente informa que debe contactar al personal. La creación de pedidos mantiene el endpoint existente.
- Mesa, Pedir y Mostrador ya no envían `estado_pago='aprobado'` ni `efectivo_aprobado=true` al crear pedidos. El backend existente normaliza pagos nuevos a pendiente y efectivo no aprobado. Una solicitud de efectivo no acredita dinero.
- Cuenta: consulta y cierre disponibles únicamente mediante sesión administrativa autorizada. Sin esa sesión se muestra un mensaje para solicitar la cuenta al personal. Solicitar efectivo sobre pedidos existentes queda bloqueado; no se inventan tokens de cliente.
- El módulo `supabaseAdmin` incorpora `server-only` para impedir su importación accidental desde el navegador.
- Se corrigieron lecturas globales en resumen operativo y diagnóstico de Analytics. Ambos validan pertenencia. Las alertas WhatsApp del resumen quedan bloqueadas porque no hay evidencia local suficiente de una relación de aislamiento para esa tabla; la respuesta informa `alertasDisponibles=false`.
- Las rutas administrativas de categorías por ID, marcas, disponibilidad de producto, addons y checkout reutilizan ahora el helper autorizado en lugar de confiar en el contexto solicitado. Addons y checkout deniegan el acceso cuando falla la resolución, sin usar un contexto de respaldo.

## Endpoints y permisos

| Endpoint | Autorización y alcance | Operaciones |
| --- | --- | --- |
| `GET /api/pedidos` | Sesión administrativa y `resolveAuthorizedAdminAccess`; restaurante validado | Listado operativo existente usado por Cocina y Mostrador. |
| `GET /api/admin/pedidos-operacion?restaurantId=…` | `requireAdminAuth` + `resolveAuthorizedAdminAccess`. El ID solicitado no autoriza acceso por sí mismo. Sin ID se resuelve un restaurante del administrador. | Sólo pedidos activos del restaurante autorizado, con sus ítems. Respuesta privada sin caché. Usado por Mozo y Cuenta. |
| `POST /api/admin/pedidos-operacion?restaurantId=…` | Misma autorización. Rechaza un `Origin` distinto. Verifica que todos los pedidos pertenecen al restaurante autorizado y están activos antes de mutar. | Lista cerrada de acciones: `estado`, `caja`, `cerrar`, `enviar_cocina`, `cocina`. Hasta 100 IDs explícitos por solicitud. No acepta payloads de actualización arbitrarios ni campos de acreditación de pagos. |
| `POST`, acción `enviar_cocina` | Un pedido autorizado; `itemId` opcional debe pertenecer a él | Un ítem o todos los que todavía no tienen estado de cocina. Los demás mantienen sus estados. |
| `POST`, acción `cocina` | Un pedido autorizado | Avance de ítems pendientes/en preparación; preserva los listos. Los comentarios se obtienen del servidor. |
| `POST`, acción `cerrar` | Sesión administrativa válida y pedidos activos explícitos del restaurante autorizado | Cierra esos pedidos; no acredita pagos. No utiliza un filtro masivo por mesa sobre históricos. |
| `POST /api/pedidos` | Creación pública existente con productos, precios y mesa validados por servidor | Continúa dependiendo exclusivamente de la RPC atómica. No se agregó fallback inseguro. |
| `GET /api/admin/operaciones-resumen` y `GET /api/admin/analytics` | Sesión y pertenencia verificadas | Pedidos acotados a restaurantes autorizados, incluido el diagnóstico. |

`service_role` se mantiene exclusivamente en servidor. No se agregó ninguna API pública de lectura por ID de pedido/mesa ni de modificación de pedidos existentes. Las rutas de aprobación de efectivo existentes no se invocaron en esta tarea.

## Archivos modificados

- Clientes: `app/cocina/page.tsx`, `app/mesa/[mesaId]/page.tsx`, `app/mesa/[mesaId]/cuenta/page.tsx`, `app/mozo/mesas/page.tsx`, `app/mozo/mesas/[mesaId]/page.tsx`, `app/mostrador/page.tsx`, `app/pedir/page.tsx`.
- Infraestructura: `lib/orderOperationsClient.ts` (nuevo), `lib/supabaseAdmin.ts`.
- Pedidos: `app/api/admin/pedidos-operacion/route.ts` (nuevo), `app/api/admin/operaciones-resumen/route.ts`, `app/api/admin/analytics/route.ts`.
- Autorización administrativa: `app/api/admin/addons/route.ts`, `app/api/admin/billing/checkout/route.ts`, `app/api/admin/marcas/route.ts`, `app/api/admin/marcas/[id]/route.ts`, `app/api/categorias/[id]/route.ts`, `app/api/productos/[id]/disponible/route.ts`.
- QA: este documento y `qa/b7/b720e-security-local.mjs`.

## Dependencias y riesgos pendientes

1. **La base continúa expuesta hasta revocar permisos**: cambiar el cliente no impide que alguien use directamente la Data API con las claves públicas. La revocación siguiente es propuesta, no aplicada.
2. **RPC `restosmart_create_order_atomic_v1` ausente**, según el contexto recibido. La creación falla hasta instalarla mediante una tarea separada autorizada. No se instaló ni se intentó reemplazarla por escrituras parciales.
3. **No hay autorización pública de cuenta**: seguimiento público, consulta, cierre y cambio de medio de pago de pedidos existentes requieren un mecanismo futuro de autorización. Permanecen bloqueados para el cliente público.
4. **Mutaciones operativas sin transacción multi-tabla**: la comprobación de comentarios detecta conflictos por ítem y las escrituras del padre se restringen a pedidos activos. Una falla entre escrituras puede dejar un avance parcial. Hay que actualizar la pantalla antes de reintentar; no se promete atomicidad. Probar concurrencia entre cierre y cocina; una transacción específica sería necesaria para garantizar una transición global indivisible.
5. **Sondeo**: puede demorar unos 5 segundos y omitir estados transitorios entre consultas. Verificar carga y experiencia con muchos pedidos y varias pantallas. El límite existente de 100 pedidos de `GET /api/pedidos` no se amplió en esta tarea.
6. **Alertas de WhatsApp**: restaurarlas sólo después de verificar una relación que permita filtrar por restaurante autorizado. No se supuso una columna inexistente.
7. **RLS sigue desactivado**, según el contexto: evaluar activación y políticas en una tarea separada; aquí sólo se prepara la revocación. Auditar también vistas, funciones, privilegios heredados, permisos por columna y futuras concesiones antes de considerar completo el aislamiento de la base.
8. No se verificaron sesiones reales, navegadores, triggers de historial ni comportamiento de Supabase después de revocar permisos. Las pruebas locales usan dobles y no prueban aislamiento real de PostgreSQL.

## SQL propuesto — NO EJECUTADO

Revisar en un entorno de pruebas autorizado. La revocación incluye `PUBLIC` para evitar permisos heredados por ese rol implícito. No elimina filas ni modifica RLS. Verificar previamente que los permisos explícitos necesarios de `service_role` permanecen y que ninguna vista/RPC pública reexpone estas tablas.

```sql
BEGIN;

REVOKE ALL PRIVILEGES ON TABLE
  public.pedidos,
  public.items_pedido,
  public.pedido_estados_historial
FROM PUBLIC, anon, authenticated;

COMMIT;
```

Si existen concesiones por columna, deberán revocarse explícitamente después de inventariarlas; la revocación a nivel de tabla no elimina esas concesiones independientes. No se inventa un inventario de columnas ni un resultado de auditoría remota. Tampoco se alteran privilegios por defecto globales, que afectarían tablas fuera del alcance.

## Verificaciones locales

- `node node_modules/typescript/bin/tsc --noEmit --incremental false`: ejecutado sobre el proyecto, sin errores.
- ESLint ejecutado con la configuración del repositorio sobre todos los archivos TypeScript modificados. Comparación con `HEAD`: 19 errores preexistentes frente a 25 en esas versiones originales, sin errores nuevos. Los errores remanentes son `no-explicit-any`, `set-state-in-effect` en Cuenta y enlaces HTML de Mozo. No se declara ESLint limpio. Los dos módulos nuevos de producción no presentan errores ni advertencias.
- `node --test qa/b7/b720e-security-local.mjs`: 11 pruebas locales de límites del endpoint con dependencias simuladas. No realizan solicitudes de red, no leen `.env` ni instancian clientes reales de Supabase.
- Búsqueda estática en componentes cliente: sin accesos directos ni suscripciones a `pedidos`, `items_pedido` o `pedido_estados_historial`. La tabla de historial no tenía accesos cliente encontrados.

## Pruebas de aislamiento pendientes (NO ejecutadas)

- Sin sesión: listados y mutaciones devuelven 401 y no acceden a datos.
- Administrador A con `restaurantId`, pedido, ítem o lote de B: rechazo sin cambios; repetir con query, headers, cookies y combinaciones de IDs.
- Administrador desactivado, tenant inconsistente y restaurante cerrado: rechazo del helper autorizado.
- Cliente público: Cuenta muestra bloqueo; ninguna ruta permite cerrar o aprobar efectivo mediante IDs arbitrarios. Payloads de creación con flags de aprobación siguen guardándose pendientes o fallan por RPC ausente.
- Luego de aplicar el SQL en un entorno autorizado: `anon` y `authenticated` no pueden leer/insertar/actualizar ninguna de las tres tablas, por REST, Realtime, grants por columna, vistas o RPCs; servidor autorizado sigue funcionando y el historial se registra correctamente.
- Cocina con ítems pendientes, en preparación y listos: avanzar sin reiniciar los listos; comprobar comentarios, sonido, destacados y separación entre sucursales.
- Cierre/caja sólo afectan los IDs activos elegidos; pedidos históricos y nuevos pedidos posteriores permanecen fuera del lote.
- Concurrencia, fallas intermedias y expiración de sesión durante sondeo; verificar recuperación sin fuga entre restaurantes ni retroceso silencioso de estados individuales.
