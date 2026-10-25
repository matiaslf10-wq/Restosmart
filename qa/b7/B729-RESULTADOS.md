# B7.29 — Pruebas reversibles previstas

**SQL preparado, no ejecutado en PostgreSQL. No se afirma que las pruebas hayan pasado.** La compilación previa de B7.24 informada por el solicitante no demuestra resultados de esta suite.

El script incorpora literalmente el borrador local B7.24 quitando únicamente su BEGIN inicial y COMMIT final. Usa BEGIN y timeouts locales; termina con ROLLBACK seguido del SELECT solicitado. Ejecutar completo en una conexión local con detención ante errores (psql: ON_ERROR_STOP=1). Ante fallo ejecutar ROLLBACK en esa conexión. El SELECT final no certifica las pruebas si el cliente continúa después de errores.

## Pruebas SQL reales previstas

- A: almacenamiento directo de configuración ficticia de dos tenants; no alta exitosa por RPC.
- B/C/D: consulta SQL de precedencia copiada de los triggers: herencia, override y methods=[] sin herencia. No invoca triggers ni resolver TypeScript.
- E: persistencia de cuenta y link ficticios asociados al tenant; no validación de titularidad ni URLs del servidor. El dominio .invalid no se visita.
- K/L: separación mediante filtros explícitos en consultas; no prueba de autorización contra service_role.
- RPC reales: configuración con sucursal inexistente debe emitir exactamente B724_SCOPE; declare con pedido inexistente debe emitir exactamente B724_ORDER_UNAVAILABLE. Otros errores se propagan.
- M parcial: rechazo de configuración no agrega eventos; no auditoría de acciones exitosas.
- P: catálogo de RLS habilitada sin políticas, privilegios efectivos de tablas para anon/authenticated/service_role, restricciones de auditoría, secuencia y seis funciones con EXECUTE restringido, SECURITY INVOKER y search_path vacío. No son peticiones REST ni sesiones impersonadas.

Cada comprobación falla con excepción o emite PASS. El contador aumenta tras cada comprobación exitosa; el NOTICE final cuenta las efectivamente realizadas, excluyendo omitidas. Un fallo impide ese NOTICE. No se anticipan aprobaciones.

## Datos o entorno adicional

F/G/H/I/J/N/O y M exitosa quedan pendientes: importe y moneda desde pedido, pending→declared, cliente sin auto-confirmación, declared→confirmed administrativo, doble confirmación y transiciones inválidas, auditoría exitosa y bloqueo/liberación de cocina.

La RPC de acción exige pedido existente y confirmar actualiza pedidos. Los snapshots requieren FK a pedidos y restaurants. La suite no inserta ni modifica pedidos, ítems, restaurantes ni relaciones históricas; no usa pedidos existentes ni deshabilita constraints/triggers. Se necesita una copia local desechable con esquema completo revisado y fixtures sintéticos de dos tenants, dos sucursales del mismo tenant y otra del segundo, pedidos, ítems y stock. Prepararlos requiere una tarea separada. Allí probar token ajeno, tenant/sucursal ajenos, efectivo, incidencias, estados terminales, inmutabilidad del importe, ARS y rollback integral ante stock insuficiente.

## Concurrencia independiente

1. Preparar B7.24 y fixtures sintéticos compartidos en una base local desechable. Los fixtures sin commit de una conexión no son visibles para otra.
2. Sesión A: BEGIN; confirmar un cobro declared usando restosmart_collection_action_v1(text,bigint,bigint,uuid,text,text,text), con operador ficticio, y mantener abierta la transacción. Sesión B: BEGIN; confirmar el mismo cobro con timeout controlado. Debe esperar el lock.
3. COMMIT de A exclusivamente en esa base desechable. B debe rechazar con B724_TRANSITION al releer confirmed; hacer ROLLBACK de B. Si A hace ROLLBACK, B puede confirmar legítimamente. Verificar un solo evento exitoso y sincronización legada.
4. Repetir confirmación versus incidencia, preparación versus confirmación y configuración versus creación usando firmas reales del borrador. Revisar ausencia de deadlocks y consistencia de snapshot/auditoría. Destruir la base desechable. No son pruebas del script monosesión reversible.

## Riesgos y controles de seguridad no cubiertos

- Requiere B7.24 ausente, prerrequisito B5 presente y privilegios DDL. No es idempotente; no ejecutar sobre B7.24 instalada.
- ALTER TABLE y CREATE TRIGGER adquieren locks sobre tablas existentes, sin reescribir filas históricas. lock_timeout limita esperas; statement_timeout limita cada sentencia, no toda la sesión.
- Identificadores ficticios con aborto ante colisión. Solo se escriben tablas nuevas; no se avanza ninguna secuencia existente. ROLLBACK revierte DDL y datos nuevos. No hay pagos, solicitudes de red ni SQL remoto.
- service_role tiene acceso amplio: aislamiento y autorización dependen del servidor. No se prueban cookies, administrador activo, CSRF/origin, JWT, Data API, fuga de tokens, navegador, máscaras de cocina TypeScript, logs ni titularidad bancaria.
- No se demuestra RLS bajo sesiones reales ni protección frente a owner/BYPASSRLS, membresías o permisos futuros. No se certifica el esquema desplegado. Revisar extensiones y event triggers con posibles efectos externos antes de ejecutar en una copia local.

Se leyeron los ocho archivos solicitados. Sin secretos, commit, push o despliegues. Los cambios locales preexistentes se conservan.
