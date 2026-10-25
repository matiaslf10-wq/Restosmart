# B7.47A — Plan de cierre para el piloto

Fecha: 2026-10-25. Base auditada: `3c94886`, `release/restosmart-v0.9-pro-pilot`. Solo propuesta documental local; no autoriza SQL ni despliegue. Hallazgos y anexo por archivo/línea en `qa/b7/B747A-AUDITORIA.md`.

**Siguiente acción mínima concreta: reparar o deshabilitar `/api/stats` y resolver el menú heredado antes de preparar un cierre ampliado.** Son H1/H2 BLOQUEANTES; reparar también H7 (mesa_id faltante) para habilitar mozo/cuenta de salón; no hace falta abrir Supabase para concretar esas reparaciones en otra tarea autorizada. Esta tarea no modifica implementación. El cierre final queda condicionado al inventario remoto de solo lectura y a un despliegue compatible.

## 1. Reparaciones de aplicación necesarias

| Clase | Trabajo propuesto | Evidencia y criterio de salida |
| --- | --- | --- |
| BLOQUEANTE | Autorizar stats con admin activo y sucursal/tenant; o deshabilitar endpoint si no se usa. | `app/api/stats/route.ts:9,17`; usar resolución equivalente a `lib/authorizedAdminAccess.ts:16`, filtrar productos mediante pertenencia, probar A/B y admin desactivado sin lectura ajena. |
| BLOQUEANTE | Migrar `/admin/menu` a API autorizada con scope o retirar esa funcionalidad del piloto de forma efectiva. No basta ocultar navegación. | `app/admin/menu/page.tsx:96,98,185,211,257`, `lib/supabaseClient.ts:6`. Definir propiedad real de menu_items/categorias antes de inventar filtros o adaptar RPC. Sin escritura anónima ni JWT Supabase supuesto. |
| BLOQUEANTE | Reparar proyección de cuenta y pantallas de mozo para personal y confirmar el alcance público esperado. | `app/mesa/[mesaId]/cuenta/page.tsx:62,63`; API `app/api/admin/pedidos-operacion/route.ts:25` omite mesa_id; también afecta `app/mozo/mesas/[mesaId]/page.tsx:309` y agrupación `app/mozo/mesas/page.tsx:800`. Debe mostrar exclusivamente la mesa pedida dentro de sucursal autorizada. No reabrir pedidos a visitantes. |
| IMPORTANTE | Revalidar admin activo también en session, eliminar logs de prefijo de token; revisar login legacy, email exacto y limitación de intentos. | `app/api/admin/session/route.ts:125,186`, `lib/adminAuth.ts:93,238`, `app/api/admin/login/route.ts:36`. No afirmar que el proxy carece de rate limiting sin consultarlo. |
| IMPORTANTE | Alinear delivery efectivo y cobros si ensayo revela divergencia; minimizar salida pública retiro con decisión de producto. | `app/api/delivery/pedidos/[id]/estado-efectivo/route.ts:176`, `app/api/admin/cobros/route.ts:48`, `app/api/public/retiro/route.ts:153`. |
| POSTPILOTO | Atomicidad portada, huérfanos, limpieza física segura y procesamiento de imágenes. | `app/api/admin/productos/[id]/imagenes/route.ts:44,46,48`, `lib/adminImageStorage.ts:47`; no son motivo para conservar policies públicas de escritura. |

## 2. Consultas remotas pendientes — exclusivamente lectura y con autorización separada

No se ejecutaron aquí ni se incluye SQL ejecutable nuevo. Solicitar resultados de catálogo acotados, sin filas de usuarios, contraseñas, tokens, configuración secreta ni URLs de conexión. Guardar evidencia sanitizada con fecha, identidad del proyecto y revisión, no copiar secretos a QA.

| Clase | Catálogo/consulta requerida | Decisión que permite |
| --- | --- | --- |
| BLOQUEANTE | Relaciones public y demás schemas expuestos: pg_class/namespace/attribute, relkind, owner, RLS/FORCE; pg_policies completas. ACL tabla y columna, schemas y propietarios; privilegios efectivos de anon/authenticated/service_role, PUBLIC y roles heredados. pg_roles y pg_auth_members con opciones INHERIT/SET, sin passwords. | Completar H3/H5. Incluir ocho tablas B744B, marcas, categorias, menu_items, configuracion_local, admin_users, order_collection_configs/collections/events, tenant_subscriptions/addons, billing_checkout_sessions y objetos latentes delivery/WhatsApp. Denegar accesos indebidos sin quitar capacidad de servicio. |
| BLOQUEANTE | Funciones/procedimientos expuestos y overloads: pg_proc, firmas, owner, prosecdef, proconfig/search_path, ACL/EXECUTE efectivo y definiciones pertinentes; pg_depend. No volcar funciones que contengan credenciales sin redacción. | Confirmar B5.2, B724, B722Q instaladas y restringidas. Detectar DEFINER y PUBLIC EXECUTE, entradas cliente, funciones fuera de public y caminos indirectos. B744B `:45` no modifica funciones. |
| BLOQUEANTE | Vistas/materializadas: definición, owner, reloptions/security_invoker, grants y dependencias recursivas. | `app/api/admin/analytics/route.ts:1219` usa vw_tiempos_pedido. Una vista puede seguir exponiendo historial/pedidos aunque cierre tablas. No asumir security_invoker instalado. |
| BLOQUEANTE | Secuencias/identity/defaults: dependencias y ACL efectivas, schemas, propietario y consumidores; pg_default_acl por creador/schema y ACL implícitas. No modificar ni avanzar secuencias. | Corregir lista fija B744B `:65,84`; incluir altas de restaurants/mesas/productos, imágenes, historial, cobros/eventos y defaults con secuencias externas. Evitar grants futuros inseguros. |
| BLOQUEANTE | pg_trigger/tgfoid y funciones, constraints/FK/cascadas y defaults relevantes, incluyendo historial/updated_at, guards/snapshot B724 y stock. | Validar derechos transitivos con INVOKER sin convertir funciones a DEFINER. B744D `:107` dio derechos a todas las secuencias, no equivalentes al DRAFT. |
| BLOQUEANTE | storage.buckets (public/límites/MIME) y todas las policies de storage.objects, roles/cmd/permissive/qual/with_check, RLS y ACL. | Resolver H4: ningún ALL/escritor alternativo aplicable, conservar GET de productos, servicio capaz de upload. B743B `:23` y B744B `:25` tienen preflights distintos; no correr ambos en secuencia. |
| BLOQUEANTE | Identidad y versión DB/extensiones relevantes, schemas expuestos Data API y vías GraphQL/Realtime según configuración; build/commit de producción, previews accesibles y logs sanitizados de consumidores antiguos. | Evitar proyecto equivocado y consumidores/browser/servidor antiguos. Catálogo solo no identifica bundles activos. No hacer peticiones de escritura durante esta fase. |
| IMPORTANTE | Solo metadatos o agregados sanitizados de integridad: sucursales sin owner, estados, asociaciones compartidas/huérfanas, mesa virtual única, columnas requeridas. Bloqueadores y transacciones largas mediante vistas de actividad sin texto sensible. | Prevenir cortes por datos heredados y planificar ventana de locks; B742F documenta fail closed en sucursales incompletas. |

Salida: matriz objeto × rol × operación × vía directa/indirecta con ACL efectiva y definición vigente, y discrepancias frente a DRAFT. Si un objeto o definición no se puede consultar, conservar la incertidumbre y no declarar cerrado ese acceso. Leer catálogo no prueba por sí solo las llamadas HTTP reales.

## 3. Ensayos locales adicionales, en una tarea posterior autorizada

1. BLOQUEANTE: regresiones concretas de H1/H2 y permisos efectivos exactos, no repetir los rechazos multipart/cookie ya cubiertos por `b743b-storage-local.mjs:103` y `b745a-http-local.mjs:117`.
2. BLOQUEANTE: laboratorio aislado con definición sanitizada equivalente a lo observado. Ensayar cierre exacto bajo anon/authenticated/service_role, sin ejecutar como superusuario las operaciones de negocio y sin grants globales de laboratorio. Usar superusuario solo para preparar entorno cuando se autorice. Probar tablas/columnas/secuencias/vistas/RPC, grants heredados y PUBLIC. Ensayar abortos por catálogo distinto y timeouts sin persistencia parcial.
3. BLOQUEANTE: HTTP real a Next aislado → pedidos B5/B724 → items/stock → triggers/historial/cobros con permisos de servicio; luego declaración pública, confirmación administrativa y bloqueo/desbloqueo cocina. B746A `B746A-RESULTADOS.md:62` aporta integración funcional superusuario, no esta cadena de identidad. Reutilizar fixtures y añadir stock controlado/concurrencia, no duplicar todos los grupos aprobados.
4. BLOQUEANTE para salón: cuenta y mozo con dos mesas; IMPORTANTE: lote caja/cierre y envío a cocina; aprobación/rechazo delivery con snapshot activo. Detectar estados parciales y cambio concurrente. Confirmar que un fallo no invita al cliente a repetir un cobro confirmado.
5. BLOQUEANTE para desplegar: navegador con build objetivo y sesión real de laboratorio: QR/pedir/retirada, cocina/mozo/mostrador, admin/configuración/analytics/cobros y multipart fotos/logos. Verificar requests de red y ausencia de SDK directo no resuelto, 405/cache/cookies/router reales, GET de imágenes históricas y URLs nuevas. No iniciar Next con entorno de producción.

Aceptación: positivas funcionan con servicio; negativas directas y entre tenants fallan sin efectos; no se necesita ningún grant anon de escritura. Capturar salida sanitizada y código de salida. Los 95 tests actuales (`B745A-RESULTADOS.md:6`) son regresión útil, no certificado RLS; no aumentar contador con pruebas redundantes.

## 4. Despliegue coordinado requerido

BLOQUEANTE. Fijar revisión compatible, evidencia de las reparaciones y plan de retorno compatible con permisos cerrados. Publicar aplicación antes del cambio DB y comprobar todos los flujos con permisos todavía vigentes. Identificar dispositivos del piloto (cocina/caja/mozo), exigir recarga/login y retirar versiones/preview anteriores accesibles con APIs privilegiadas. La recarga no revoca claves anon: el cierre DB/Storage sigue siendo necesario.

Registrar build servido, ventanas de caché/CDN y sesiones/pestañas conocidas; establecer ventana de baja actividad y responsables. Ante tráfico viejo de escritura, bloquear versión o retirar endpoint inseguro, explicar al operador la actualización requerida; no conservar grants públicos para prolongar compatibilidad. Rollback de aplicación solo a revisión que use APIs seguras. Revisar explícitamente este criterio aunque el código local no tenga consumidores anon de las ocho tablas.

## 5. Preparación y aplicación de seguridad — requiere aprobación futura

BLOQUEANTE. Tras reparar y obtener catálogo, preparar una propuesta revisable en otra tarea: alcance completo, diferencias exactas, preflight y postflight, timeouts/locks, evidencia y contingencia. No se generó aquí migración ni sustituto ejecutable. Aprobar el SQL concreto y la ventana, no aprobar genéricamente «RLS».

La propuesta debe contemplar PUBLIC/herencia/columnas, secuencias reales y default privileges por creador; funciones/overloads/vistas y objetos adicionales; identidad/service_role y dependencias INVOKER; todas las policies Storage aplicables conservando lectura prevista. No ampliar grants del servicio indiscriminadamente ni hacer DEFINER para sortear un error. Separar objetos sin consumidor legítimo y documentar cualquier lectura pública deliberada mediante APIs mínimas.

Preflight: identidad de proyecto y build, catálogo/definiciones/ACL capturadas, copia de recuperación disponible, ausencia de bloqueadores, credenciales del backend válidas sin exponerlas, abortar ante drift. Postflight dentro de transacción: ACL efectivas tablas/columnas/secuencias/funciones, RLS y ausencia de vías de Storage; validar derechos del backend. Controlar errores con ejecutor fail closed y conexión dedicada; no continuar un archivo parcialmente fallido. Mantener ventana corta con locks ordenados.

`b744b_security_DRAFT.sql:124` termina ROLLBACK y no es una migración aplicable tal cual. `b743b_storage_DRAFT.sql:35` tiene COMMIT y exige aprobación propia. Conciliar ambos diseños: aplicar B743B primero hace que B744B aborte por policies ausentes. El preflight no debe ser borrado para forzar un resultado.

## 6. Pruebas posteriores positivas y negativas

BLOQUEANTE para dar por cerrado el piloto. En ventana autorizada tras persistir el cierre, usar fixtures/recursos de QA acordados; las pruebas de escritura remotas requieren autorización separada de las consultas de lectura.

| Positivas | Negativas y criterio |
| --- | --- |
| Menú/QR de sucursal activa, pedido con stock/precio oficial, historial y snapshot correctos. | anon/authenticated no leen ni escriben objetos privados, por tabla/columna/vista/RPC/overload/GraphQL si expuesto; secuencias privadas inaccesibles. Menú de otra sucursal no mezcla productos ocultos. |
| Login, selección de sucursal, cocina, envío, caja/cerrar y cobros con personal autorizado. | Sin cookie, alterada/expirada, admin desactivado, sucursal/tenant/producto/imagen ajenos: rechazo sin efectos. No confirmar pago por campos del cliente o por p_operator arbitrario. |
| Declaración con token válido, confirmación por operador; delivery coherente con cobros. | Token inválido/reutilización incompatible/acción de confirmación pública rechazados; pendiente bloquea cocina; ningún cobro doble ante reintento. |
| Fotos/logos multipart por API; portada y metadata legibles; GET público de imágenes nuevas e históricas. | INSERT/UPDATE/upsert/DELETE directos Storage denegados para anon y authenticated incluso sobre path conocido; otra policy o bucket no reabre productos. Tenant B no opera recursos de A por API. |
| Analytics con vista, configuración, CRUD de productos/marcas/mesas y alta autorizada de sucursal. | Vistas y funciones no reabren datos, error de permiso no devuelve filas ajenas, no se concede acceso a PUBLIC como reparación. |

Revisar métricas/errores de permisos y locks, sin tokens ni datos personales en capturas. Conservar evidencia por build/catálogo/rol/operación, no solo «HTTP 200» o cantidad de tests.

## 7. Contingencia sin reabrir permisos públicos

1. BLOQUEANTE: ante error antes de COMMIT, rollback integral y cerrar conexión; verificar ausencia de cambio parcial. No ejecutar por secciones para eludir guards.
2. BLOQUEANTE: después de COMMIT, mantener cierre y suspender solo operación afectada con aviso al personal; preservar pedidos, cobros, historial, metadata y objetos. Para pedido/cobro de resultado incierto, consultar estado antes de reintentar.
3. BLOQUEANTE: diagnosticar objeto/rol exacto; si falta permiso backend, proponer reparación mínima al servicio con aprobación. Si el problema está en cliente/API, publicar corrección o volver a build compatible, recargar dispositivos. No restaurar versión antigua que dependa de navegador.
4. IMPORTANTE: uploads fallidos: retener objetos para reconciliación, posponer nuevas subidas y mantener imágenes históricas; no borrar objetos compartidos para «limpiar» durante contingencia.
5. BLOQUEANTE: no usar por defecto la restauración de policies públicas descrita en `b743b_storage_DRAFT.sql:41,45`, ni el rollback de cobros `b724_order_collections_ROLLBACK.sql:3` que retira guards/RPC. Cualquier reversión excepcional de seguridad exige decisión explícita sobre cambio concreto y evidencia; no constituye el plan primario.

## Verificación documental

`node_modules/.bin/tsc.cmd --noEmit`: exit 0, sin diagnósticos. `git diff --check`: exit 0; los documentos untracked se revisan además por whitespace. Sin cambios funcionales/SQL existentes ni ejecución de los ensayos propuestos. Permisos remotos, catálogo y despliegue activo siguen siendo incertidumbres, no resultados negativos inventados.
