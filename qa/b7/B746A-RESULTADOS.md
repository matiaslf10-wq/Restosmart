# B7.46A — Integración SQL local reversible

**Estado inicial: ejecución SQL PENDIENTE de correr con psql en el host. No hay resultados funcionales confirmados ni PASS ejecutados en esta entrega.**

Fecha: 2026-10-25. Rama inspeccionada y conservada: `release/restosmart-v0.9-pro-pilot`. HEAD: `d2dcf2b`.

Se creó `qa/b7/b746a_integracion_LOCAL_ROLLBACK.sql`. Se inspeccionaron B5.2, B724, B729, B730, B744B, B744D y los informes B743B/B745A. No se encontraron archivos B739/B740 en el árbol QA disponible. Se reutilizó la forma de fixtures comprobada en B744D, con identificadores nuevos, dos tenants y tres sucursales. No se ejecutó psql, no se inspeccionó una base viva ni se solicitaron credenciales. Los contratos proceden de los SQL del repositorio; la compatibilidad real queda a cargo del preflight del host.

## Ejecución pendiente

Usar PostgreSQL 16 local, base `restosmart_qa`, en una sesión nueva como superusuario del laboratorio. No se modifica ningún rol ni se necesita modificar `service_role`. El ejecutor debe proporcionar `ON_ERROR_STOP=1`, usar `-X` y ejecutar el archivo completo, sin transacción adicional (`--single-transaction`). El archivo contiene un único `BEGIN;` exterior y termina en `ROLLBACK;`. Los `BEGIN` de PL/pgSQL son bloques, no transacciones adicionales.

El bloque PowerShell del ejecutor debe fijar explícitamente localhost, base y puerto local; no depender de un servicio o URI remoto. No incluir contraseñas en comandos o informes. Guardar salida y código de salida. Ante error, no interpretar los NOTICE anteriores como éxito integral: la conexión del proceso debe cerrarse para descartar la transacción abortada. No ejecutar bloques seleccionados ni sustituir el ROLLBACK por COMMIT.

Ejecutar en QA sin actividad concurrente: se toman locks exclusivos sobre las nueve tablas durante la prueba. El preflight rechaza otra base, dirección de servidor no loopback, versión diferente, RPC/columnas ausentes, triggers B724 faltantes o mal vinculados, triggers adicionales habilitados, event triggers habilitados y colisiones. Los fixtures usan el rango `9223372036854746001..9223372036854746099`, slugs `b746a-*` y tenants `b746a-a`/`b746a-b`. Columnas adicionales obligatorias sin default u otras restricciones locales pueden abortar el fixture: registrar el diagnóstico y adaptar únicamente esta prueba tras inspeccionar ese contrato.

## Cobertura esperada al ejecutar

| Grupo | Evidencia exigida por el SQL |
| --- | --- |
| Alta real | Wrapper B724 instalado referencia B5.2; llamada real crea pedido, item de cantidad 2, importe oficial y snapshot de cobro |
| Virtual | Transferencia pendiente, importe 3000 ARS, método guardado, sin acreditación inicial |
| Cocina | UPDATE de estado y comentario rechazados mientras está pendiente; estado rechazado después de declarar; ambos permitidos después de confirmar |
| Cliente | UUID incorrecto rechazado; declaración deja pago pendiente; operador `customer` no puede confirmar |
| Administración | Operador ficticio confirma virtual; duplicado falla; efectivo confirma desde pendiente y activa `efectivo_aprobado` |
| Incidencia | Motivo vacío rechazado, motivo ficticio persistido, estado final `incident`, pago pendiente y cocina bloqueada |
| Aislamiento | Tenant discordante, sucursal discordante del mismo tenant, configuración ajena, scope ajeno, mesas de otro tenant/sucursal y producto fuera del menú rechazados |
| Configuración | Todas las configuraciones se escriben por RPC B724; tenant B conserva configuración y obtiene su propio método/importe; cambiar A no cambia snapshots existentes |
| Override vacío | RPC configura `methods: []` en segunda sucursal A; crear con transferencia falla en trigger real, sin heredar métodos del tenant |
| Auditoría | Conteos exactos y operadores en creación/declaración/confirmación/incidencia; cuatro eventos de configuración; scope de eventos consistente con cobros |
| Historial | Reproducción temporal B744D: alta solicitado y cambio en_preparacion; cinco eventos en total, sin eventos por cambios de pago ni rechazos |
| Conservación | Cuatro pedidos/cobros, total 10400; cuatro items con ocho unidades; item virtual idéntico salvo comentario de cocina permitido |
| Rechazos atómicos | Antes/después de cada rechazo se comparan todas las filas y columnas de las nueve tablas y del historial auxiliar; mensaje de excepción exacto obligatorio |

Cada grupo emite `NOTICE PASS` solo después de sus aserciones. Una excepción inesperada se propaga y aborta la ejecución. No se sustituyen RPC por INSERT de pedidos/cobros/configuración. Los INSERT directos se limitan a fixtures base; los UPDATE de cocina ensayan los triggers reales.

## Reversibilidad y controles posteriores del ejecutor

No se borran ni limpian tablas, no se reemplazan funciones preexistentes y no se cambian grants ni roles. Helpers, tabla y función histórica viven en el schema nuevo `b746a_lab`, sin acceso PUBLIC; su trigger temporal se agrega a pedidos y todo revierte con la transacción. La reproducción del historial conserva la lógica INSERT/cambio de estado de B744D; usa `to_jsonb(NEW)` para tomar `creado_en` si existe y `now()` en otro caso. No reproduce triggers `updated_at`, ni instala el historial en `public`.

Los incrementos de secuencia normales NO revierten con ROLLBACK. Por ello se aplica `ALTER SEQUENCE ... RESTART WITH` transaccional a secuencias propias de las tablas involucradas antes de llamar las RPC. Se conserva el siguiente valor lógico según `last_value`, `is_called` e incremento. PostgreSQL descarta el almacenamiento de secuencia transaccional al revertir; no se usa `setval`. Defaults que referencien secuencias no propias provocan aborto. La tabla histórica auxiliar tiene secuencia nueva que desaparece íntegramente.

Antes de correr, el ejecutor debe capturar en su sesión de control: filas/conteos de las nueve tablas, triggers/permisos/roles y `last_value`/`is_called` de secuencias propias. Después de que psql termine con código 0 y muestre `ROLLBACK`, comprobar desde otra conexión:

- `SELECT to_regnamespace('b746a_lab');` devuelve NULL.
- No hay restaurantes con slugs `b746a-*`, tenants `b746a-a`/`b746a-b`, ni fixtures del rango reservado en mesas/productos/producto_restaurantes.
- No hay configuraciones, cobros o eventos con esos tenants, ni trigger `b746a_historial` en pedidos.
- Datos, secuencias, triggers preexistentes, permisos y atributos de roles coinciden con la captura anterior. No certificar reversibilidad únicamente por ver los NOTICE.

Estos controles posteriores se dejan al ejecutor para mantener `ROLLBACK;` como sentencia final del archivo solicitado. No se ha validado todavía el comportamiento de los contadores en este host.

## Límites y NO VERIFICADA

- Autenticación del administrador real y seguridad HTTP: B724 acepta `p_operator` como texto. Rechazar `customer` prueba una regla SQL, no una identidad administrativa; un caller privilegiado puede proporcionar otro texto. Las cookies/autorización de API quedan fuera de esta prueba.
- RLS y permisos efectivos como anon/authenticated/service_role: se ejecuta como superusuario local para evitar modificar roles y aislar la prueba funcional. No es una repetición de B744B ni certifica aislamiento ante acceso arbitrario con privilegios de servicio.
- Cocina UI/filtros de lectura, todas las transiciones de items y cualquier escritura externa a los contratos probados. El guard SQL de items B724 bloquea comentarios pendientes; no representa un motor completo de estados de cocina.
- Stock controlado, concurrencia, deadlocks, conexiones remotas, esquema de producción, Storage, pagos reales o proveedores externos. Los pedidos usan `p_control_stock=false`, igual que el fixture B744D.
- Otros defaults, funciones instaladas modificadas o escritores desconocidos requieren inspección del host. El preflight no demuestra identidad byte a byte con el DRAFT: valida firmas, vínculo de triggers, referencia del wrapper y comportamiento mediante aserciones.

Revisión estática local y `git diff --check` solamente; ejecución SQL y controles posteriores pendientes. No se cambió implementación de producto, dependencias, SQL históricos, billing, checkout, webhooks ni secretos. `qa/b7/b722t_billing_compile_ROLLBACK.sql` preexistente se conserva intacto. Sin red, commit, push, deploy ni cambio de rama.

## Ejecucion efectiva y verificacion posterior - B7.46B

El ejecutor Windows ejecuto el SQL completo en PostgreSQL 16,
base restosmart_qa, con ON_ERROR_STOP=1. Salida psql: exit 0,
todos los grupos funcionales emitieron NOTICE PASS y la
transaccion termino en ROLLBACK.

Comprobacion inmediata: cero restaurantes b746a-* persistidos.

La verificacion posterior independiente B7.46B confirma
ausencia del schema b746a_lab, trigger auxiliar y fixtures
identificados en restaurantes, mesas, productos y asociaciones.

Las secciones anteriores tituladas "pendiente" describen el
estado del informe antes de la ejecucion; quedan superadas
por esta evidencia posterior.

Limites: no se capturo una huella completa anterior/posterior
de secuencias, grants y cada tabla. No se certifican RLS
remota, Storage remoto, concurrencia ni stock real.
No se aplico SQL en Supabase.