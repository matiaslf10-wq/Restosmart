# B7.30 — QA integral de cobros propios: preparación reversible

**SQL preparado y revisado como texto; NO ejecutado en PostgreSQL, local ni remoto. No hay resultados PASS observados. El circuito completo sigue pendiente.**

Se crearon exclusivamente este informe y `b730_order_collections_INTEGRATION_ROLLBACK.sql`. No se modificaron código, B7.24, archivos previos, secretos ni datos; sin servicios, pagos reales, commit, push o despliegue. Los cambios preexistentes de B7.24 y B7.29 se preservaron.

## Evidencia del esquema y decisión sobre fixtures

Se leyeron los doce archivos solicitados, se buscaron definiciones SQL en el repositorio y se revisó adicionalmente `qa/b7/b719f_mesas_virtuales.sql`. B5.2 contiene una función, **no el DDL de sus tablas**. B7.19F tampoco define mesas: inserta mesas virtuales para restaurantes existentes; no se incorpora ni ejecuta.

Dependencias que B5.2 utiliza realmente:

| Relación | Columnas referenciadas y operación |
|---|---|
| restaurants | id, estado, plan; lectura y validación de disponibilidad |
| mesas | id, restaurant_id; verifica pertenencia |
| productos | id, disponible, precio; lectura con FOR SHARE |
| producto_restaurantes | producto_id, restaurant_id, visible_en_menu, control_stock, stock_actual, permitir_sin_stock, actualizado_en; FOR UPDATE y eventual descuento |
| pedidos | restaurant_id, mesa_id, estado, total, paga_efectivo, forma_pago, origen, tipo_servicio, medio_pago, estado_pago, efectivo_aprobado, cliente_nombre, cliente_telefono, notificar_whatsapp, direccion_entrega; INSERT, retorno de fila con id |
| items_pedido | pedido_id, producto_id, cantidad, comentarios, marca_id, marca_nombre_snapshot, marca_color_hex_snapshot, marca_logo_url_snapshot; INSERT |

B7.24 además lee `restaurants.owner_tenant_id`, agrega `pedidos.moneda_cobro` y referencia pedidos/restaurants mediante FK. No se dispone del DDL completo de tenants, relaciones de propiedad, defaults, identidad/secuencias, NOT NULL, checks, FK, RLS ni triggers anteriores de estas tablas. Las columnas que una RPC escribe no demuestran que sean suficientes para crear un restaurante, un producto o sus ancestros.

Por esa dependencia desconocida no se inventan fixtures, no se clonan filas existentes, no se deshabilitan restricciones y no se reemplaza B5 por un stub. Los únicos identificadores ficticios son candidatos ausentes usados en rechazos: tenant `b730-fiction-tenant`, restaurante `9223372036854730001`, pedido `9223372036854730002`, producto `9223372036854730003`, mesa `9223372036854730004` y UUID `b7300000-0000-4000-8000-000000000001`. El script comprueba previamente su ausencia en las relaciones consultadas; cualquier colisión aborta. No se da de alta ningún tenant, restaurante, producto, mesa, pedido ni ítem. No se afirma haber comprobado un catálogo de tenants cuya definición se desconoce.

## Cobertura ejecutable diseñada

Estas son llamadas a funciones reales con comprobación del error exacto y excepción ante aceptación inesperada. Cada caso funcional emite su propio `RAISE NOTICE 'PASS ...'` solamente después de la comprobación. Están diseñados **17 casos funcionales**, no ejecutados:

- Cuatro llamadas B5.2: rechaza `estado_pago=aprobado`, rechaza `efectivo_aprobado=true`, rechaza forma de pago inventada y rechaza restaurante inexistente. Los primeros dos casos llegan al control real de autoacreditación antes de consultar el restaurante; usan ítem sintácticamente válido para no detenerse en validación anterior.
- Una llamada al wrapper B7.24: llega al rechazo de restaurante inexistente de la RPC B5 real. No demuestra creación ni snapshot.
- Una llamada a configuración B7.24: rechaza sucursal inexistente con `B724_SCOPE`.
- Tres llamadas de acción B7.24: declare, confirm e incident rechazan pedido inexistente con `B724_ORDER_UNAVAILABLE`. No demuestran validación del token, del operador o de transiciones.
- Ocho invocaciones bajo `SET LOCAL ROLE` real: cuatro RPC (B5 y las tres públicas de negocio B7.24) para cada rol anon/authenticated. Verifica antes que no exista EXECUTE efectivo, comprueba `current_user` y exige SQLSTATE 42501 en la invocación. El cambio de rol queda fuera del handler para no confundir falta de membresía con rechazo RPC. Un rol público intenta confirm con texto de operador administrativo: debe ser detenido por permisos antes de ejecutar el cuerpo.

La postcondición exige que las tres tablas nuevas estén vacías tras los nueve rechazos iniciales. Un error diferente al esperado se propaga. No hay INSERT de prueba en tablas base, por lo que estos caminos no alcanzan stock, defaults de pedidos ni sus triggers de filas.

Hay inspección adicional de catálogo con `INFO`, **sin PASS funcional**: RLS habilitada sin policies, permisos efectivos de tablas y secuencia para anon/authenticated, EXECUTE para esos roles y service_role, SECURITY INVOKER y search_path vacío de siete funciones, incluyendo B5. Si hay privilegios heredados inesperados, aborta. No prueba aislamiento RLS por filas, acceso Data API, JWT, roles propietarios ni la capacidad de service_role de completar escrituras.

## Matriz de los 22 objetivos

| N.º | Objetivo | Estado de diseño y límite |
|---|---|---|
| 1 | Configuración propia del tenant | Pendiente alta por RPC: exige restaurante perteneciente al tenant. Solo ejecutable rechazo por sucursal inexistente. |
| 2 | Herencia hacia sucursal | Pendiente: crear pedido con wrapper real y comprobar snapshot heredado; no se copia el SELECT del trigger como prueba. |
| 3 | Override de sucursal | Pendiente: configurar con RPC y crear pedido que capture medio propio de esa sucursal. |
| 4 | Override vacío sin herencia | Pendiente: RPC de configuración y alta real rechazada por B724_METHOD_REQUIRED; tabla de productos/stock necesaria para alcanzar trigger. |
| 5 | Crear pedido con RPC atómica real | Pendiente alta exitosa. Hay invocaciones reales de rechazo B5 y del wrapper. |
| 6 | Snapshot importe, moneda y medio | Pendiente: alta real, comparar payment devuelto, pedido, collection y configuración; probar inmutabilidad y cambio posterior de config. |
| 7 | Nacimiento pendiente de pago | Pendiente alta exitosa, verificar estado_pago pendiente, efectivo_aprobado false y collection pending. |
| 8 | pending → declared | Pendiente pedido virtual ficticio real y token retornado por wrapper. |
| 9 | Declarar sin acreditar | Pendiente llamada declare exitosa y comparación posterior de estado_pago/efectivo_aprobado y ausencia de evento confirm. |
| 10 | Token incorrecto | Pendiente pedido existente ficticio: un pedido ausente falla antes del control de token. |
| 11 | Tenant/sucursal ajenos | Pendiente dos tenants reales ficticios y tres sucursales; inexistencia no demuestra aislamiento entre propietarios. |
| 12 | Autoaprobación pública | Parcial ejecutable: B5 rechaza ambos indicadores de acreditación y roles públicos no pueden invocar RPC. Pendiente endpoint público real y confirm con operador customer sobre declared existente. |
| 13 | Bloqueo cocina con pago exigido | Pendiente UPDATE real de pedido y comentarios sobre fixture, exigir B724_PAYMENT_REQUIRED; máscara y API TypeScript fuera del alcance SQL. |
| 14 | declared → confirmed admin | Pendiente fixture declared y llamada action real; autorización de la cookie se verifica aparte en API. |
| 15 | Sincronizar estado_pago aprobado | Pendiente confirm real y aserción de fila legada. |
| 16 | Auditoría confirmación | Pendiente comprobar exactamente un evento confirm con ámbito/operador/nota correctos y ninguna duplicación ante rechazo. |
| 17 | Liberar cocina acreditada | Pendiente UPDATE real permitido de pedido/ítems tras confirm; respuesta de máscara/API también pendiente. |
| 18 | Confirmación repetida | Pendiente segundo confirm del mismo fixture y B724_TRANSITION, sin evento extra. |
| 19 | Incidencia en pedido separado | Pendiente segunda alta, incident real con motivo, estado terminal sin acreditar; rechazo de motivo vacío y de acciones posteriores. Rechazo de inexistente ejecutable. |
| 20 | Efectivo | Pendiente alta independiente pending, declare rechazado y confirm administrativo permitido directamente; efectivo_aprobado true y auditoría. |
| 21 | Históricos preservados | Sin escrituras históricas diseñadas ni backfill en B7.24; pendiente regresión funcional con pedido sintético anterior a B7.24, nunca usando pedidos históricos reales como fixture. |
| 22 | RLS, grants y RPC | Parcial: ocho llamadas de denegación RPC ejecutables y catálogo con INFO. Pendiente RLS por filas bajo sesiones reales y operaciones exitosas service_role. |

## Riesgos de autorización y efectos secundarios

- **p_operator es texto confiado, no una identidad autenticada.** Confirm rechaza NULL o el literal customer; cualquier otro texto, incluso vacío, supera ese control si el estado permite confirmar. Incident tiene una comprobación similar. No vincula operador a un administrador ni verifica que el token pertenezca al operador en confirm. Config registra el operador suministrado. La defensa es restringir EXECUTE y credenciales de servicio al servidor y derivar el operador de sesión validada. `app/api/admin/cobros/route.ts` llama requireAdminAuth/resolveAuthorizedAdminAccess y construye ese texto. No se certificó la implementación transitiva de esos helpers ni su ejecución. No es seguro exponer la RPC de acción con credenciales de servicio a usuarios.
- **Autoaprobación pública:** la ruta pública ignora action/tenant/restaurant del cuerpo, resuelve ámbito por token y envía declare/customer. Eso es inspección del código, no prueba HTTP. El rechazo de confirm/customer en SQL depende también del estado: con pending virtual se devuelve B724_TRANSITION antes de B724_OPERATOR. Un caso válido para probar operador requiere primero declared.
- **Permisos heredados:** REVOKE sobre PUBLIC/anon/authenticated no elimina grants a otros roles que estos puedan heredar, privilegios de columna, membresías con posibilidad de SET ROLE, owner, superusuario o BYPASSRLS. `has_*_privilege` cubre permisos efectivos del rol consultado, no toda escalada posible. El script no audita todas las ACL por columna/membresías/default privileges ni grants futuros. RLS sin policies no restringe owner/BYPASSRLS. service_role conserva acceso directo amplio, incluida mutación de cobros; las invariantes de la RPC no equivalen a constraints contra todas las escrituras directas.
- **Auditoría:** se conserva literalmente el REVOKE de su secuencia. INSERT/SELECT concedidos a service_role no prueban inmutabilidad absoluta frente al owner, BYPASSRLS o permisos heredados adicionales. La secuencia nueva pertenece al DDL que se revierte; ninguna llamada diseñada debe alcanzar un evento.
- **Triggers globales:** B7.24 instala triggers en todos los pedidos/items, no exclusivamente fixtures. No se altera ni deshabilita otro trigger. El preflight aborta ante event triggers habilitados, antes del DDL incorporado, por sus posibles efectos externos. Revisar además extensiones, funciones y hooks de la copia local antes de ejecutar: ROLLBACK no deshace efectos externos de código arbitrario. No se certifica el orden con triggers desplegados desconocidos.
- **Locks:** ALTER TABLE y CREATE TRIGGER pueden adquirir locks fuertes sobre pedidos/items; incluso una suite que finalmente revierte puede bloquear sesiones durante toda la transacción. Los rechazos de pedido inexistente no bloquean filas históricas, pero la consulta de su ausencia no es una reserva contra altas concurrentes. Ejecutar solo en copia aislada sin escritores. lock_timeout=3s limita cada espera y statement_timeout=40s cada sentencia, no el tiempo total de la transacción ni una sesión ociosa. No dejar la transacción abierta tras un error.
- **Stock:** B5 ordena productos, toma FOR SHARE en productos y FOR UPDATE en producto_restaurantes, descuenta según p_control_stock, plan y control_stock. No se ejercita ese camino. Un alta exitosa puede avanzar secuencias de pedidos/ítems aunque luego haya ROLLBACK: nextval de secuencias preexistentes no se revierte. Por ello no se promete reversibilidad de secuencias para futuras pruebas positivas. Haría falta una copia desechable y estrategia de IDs revisada, sin setval sobre secuencias históricas.
- **Concurrencia:** acción bloquea pedido y luego cobro; config/wrapper usan advisory lock por tenant. No certifica ausencia de deadlocks con otros triggers, escritores directos ni otras APIs. Inserts B5 directos no toman el advisory lock del wrapper. La variable transaccional collection_method y el snapshot se deben probar también con errores/reintentos. Una sesión no puede demostrar carreras de confirm/incident/config/stock.

## Validación reversible prevista (no realizada)

1. Usar exclusivamente una copia PostgreSQL local desechable, aislada y con esquema B5 completo, RPC B5.2 real instalada y roles anon/authenticated/service_role. B7.24 debe estar ausente. No usar producción, servicios remotos ni pedidos reales. Revisar definiciones de funciones y dependencias locales antes de ejecutar; esta suite no instala/reemplaza B5.
2. Usar una conexión cuyo rol tenga los permisos DDL/lectura necesarios y pueda SET ROLE a anon/authenticated. No agregar grants para hacer pasar la suite: una denegación de SET ROLE significa prerrequisito no satisfecho, no PASS. Revisar esquema public accesible para poder atribuir denegaciones a EXECUTE.
3. Ejecutar **todo el archivo**, en una sola conexión con detención ante errores. Por ejemplo, en esa copia local: `psql -X --set=ON_ERROR_STOP=1 --file=qa/b7/b730_order_collections_INTEGRATION_ROLLBACK.sql` usando una conexión local ya configurada. No agregar opciones que impriman secretos ni activar autocommit por sentencia en un editor. No se ejecutó este comando durante la preparación.
4. Debe empezar por BEGIN y timeouts locales. El bloque B7.24 se incorpora desde el archivo real retirando solo sus dos sentencias exteriores BEGIN/COMMIT; conserva comentarios, funciones y REVOKE de secuencia. El script no es idempotente ni se ejecuta sobre B7.24 instalada.
5. Exigir ausencia de errores, los nueve PASS de rechazo inicial y ocho de roles, más INFO de catálogo/postcondición, y llegada al ROLLBACK. Si ocurre un fallo, hacer ROLLBACK en esa misma conexión o cerrarla. El SELECT informativo final no acredita éxito si el cliente continuó tras un error; los NOTICE previos tampoco acreditan los casos posteriores.
6. Tras terminar, verificar en la copia que no quedaron tablas, columna, triggers ni funciones nuevas B7.24. Esto requiere comparar con el estado previo; aquí no se hizo ninguna consulta SQL de verificación.

Para completar las pruebas positivas se requiere primero un dump DDL local revisado (sin datos/secretos), incluyendo tenants y ancestros, tipos, constraints, índices, triggers, funciones, RLS y secuencias. Con él se podrán diseñar dos tenants ficticios, dos sucursales del primero y una del segundo, mesas/productos/stock e IDs sin colisión. Usar pedidos separados para transferencia, incidencia, efectivo e histórico sintético; nunca reciclar un cobro confirmado. Comprobar retorno y filas tras cada llamada real, y lanzar excepción ante cada discrepancia. Las pruebas de máscara de cocina, cookies, origen y pertenencia administrativa requieren ejecutar las funciones/APIs reales en una tarea aparte; SQL no las sustituye.

La concurrencia requiere un entorno desechable con fixtures visibles por dos sesiones y una preparación autorizada fuera de este archivo reversible. Casos pendientes: confirm/confirm, confirm/incident, confirm/preparación, config/alta y dos altas disputando stock. Comprobar espera/relectura bajo lock, un único evento exitoso, consistencia legada y ausencia de escrituras parciales. No se incluyen sesiones auxiliares ni persistencia de fixtures en B7.30.
