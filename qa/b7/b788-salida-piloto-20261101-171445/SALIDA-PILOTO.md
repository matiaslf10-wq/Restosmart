# B788 — salida del piloto

Revisión estática, 2026-11-01. **No se declara el piloto habilitado. No hace falta modificar producto para resolver la incertidumbre B787 ni incorporar la revocación QA.** Solo se escribió este documento. Sin tests, SQL, servicios, instalaciones, red, Git de escritura ni lectura de `.env`/secretos.

## Arranque real y destino

- Desde `C:\Users\matia\restosmart`: `npm run dev` ejecuta `next dev` (`package.json:8–12`; `README.md:5–19`), con acceso documentado en `http://localhost:3000`. Requiere Node 24.x (`package.json:5–6`) y dependencias disponibles conforme a `package-lock.json`. No hay script npm específico de piloto ni ejecutor QA en esos scripts. Para un build de producción: `npm run build` y después `npm run start`; no ejecutados aquí y sin acreditar un build vigente.
- La aplicación completa vive en `app/`: `/` es la landing (`app/page.tsx:133`), enlaza `/admin/login` (`app/page.tsx:7`); el login devuelve `/inicio` (`app/api/admin/login/route.ts:82`). `next.config.ts:3–7` no fija backend ni destino de despliegue. El README es genérico; `qa/b7/B724-COBROS-PILOTO.md` documenta cobros y límites, no otro comando de arranque.
- Backend efectivo: `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` en navegador (`lib/supabaseClient.ts:3–6`); misma URL y `SUPABASE_SERVICE_ROLE_KEY` solo en servidor (`lib/supabaseAdmin.ts:1–20`). La firma administrativa exige `ADMIN_SESSION_SECRET` (`lib/adminAuth.ts:28–31`). No se inspeccionaron sus valores. Tenant por cabeceras/host, `NEXT_PUBLIC_ROOT_DOMAIN` y fallback `DEFAULT_TENANT_ID` (`lib/tenant.ts:39–73`); la autorización verifica administrador activo y restaurante del tenant (`lib/authorizedAdminAccess.ts:27–79`). Se requieren registros válidos para el recorrido elegido.
- El código pendiente de pedidos llama `restosmart_orders_b762l_v1` y `restosmart_kitchen_b762l_v1` en ese backend (`app/api/admin/pedidos-operacion/route.ts:85–103`). `lib/atomicContract.ts:15–17` devuelve 503 ante funciones/dependencias/permisos ausentes. Arrancar Next no instala SQL.
- **B765 es candidato SQL de ensayo, no aplicación ni instalador del piloto**: `qa/b7/b765-validacion/candidato-B765.sql:1`, `RESULTADO.md:13–19` y `run.ps1:19,102–105`. Su ejecutor usa `127.0.0.1:55458/b762m_lab`, ensaya y revierte. El candidato exige rol fijado en metadatos (`candidato-B765.sql:6–14,190–196`), revoca EXECUTE y deja pendiente conceder permisos al rol de aplicación (`:168–188`). No corresponde ejecutarlo como migración de salida.

## Revocación QA y cierre B787

La revocación temporal pertenece exclusivamente a estos laboratorios. B776 asigna/revoca LOGIN/password de `b768_auth` (`qa/b7/b776-http-real/runner.cjs:21–26`), y construye una copia temporal del handler pedidos-operacion y sus imports (`:102–109`); su Next apunta al puente sintético `127.0.0.1:54321`, no al destino configurado del producto. B768 declara base `b768_compat_lab`, PostgREST 55468 y servicios externos a su E2E (`qa/b7/b768-compatibilidad/RESULTADO.md:17,39`).

B786 usa otra base/rol: `127.0.0.1:55486/b786_finalization_lab`, `b786_auth` (`qa/b7/b786-integracion-http-20261101-165611/adapter.cjs:4,18`). Su `http.cjs:21–32` copia solo logout/adminAuth, levanta Next 3006 y lee `/probe` directamente por PostgREST 55487; `finalizacion.cjs:6–11` revoca ese rol. La entrada es `EJECUTAR-ENSAYO.ps1:3–12`, que invoca `runner.cjs`, no el arranque de producto. El logout real solo limpia cookies (`app/api/admin/logout/route.ts:7–9`; `lib/adminAuth.ts:194–225`). Revocar un login PostgreSQL temporal QA no es una dependencia de ese logout ni del arranque npm.

Por tanto, queda resuelta la identificación de ejecutor y relación pedida en B787: **producto = Next en raíz; candidato = SQL B765; ejecutores = QA aislado**. No se exige integrar B785/B786 ni repetir B778 para resolver esa correspondencia.

Terminado: revisión del arranque, separación de alcances y selección de commit. Los JSON B785/B786 registran `FINALIZATION_VERIFIED`, revocación confirmada, errores vacíos y cluster detenido. `laboratorio-B786/evidencia/http.json` acredita logout 200 sin autenticación/recorrido a PostgREST y probe 200; no acredita el flujo funcional completo. Se conserva el FAIL histórico B778 y la recuperación posterior informados por B787, sin convertirlos en PASS.

**Dato externo indispensable pendiente:** constancia sanitizada del operador que identifique el proyecto/backend efectivo del piloto (URL pública o identificador, sin claves), tenant/restaurante y recorrido elegido; y confirme en ese mismo destino las versiones instaladas de las dos RPC, el rol servidor efectivo autorizado en sus metadatos y sus permisos/dependencias para ese recorrido. El repositorio no fija ese destino ni prueba su estado actual. Si el recorrido incluye cobros, debe incluir su esquema/política vigente; la compatibilidad legacy sintética B768 no acredita cobros reales (`qa/b7/b768-compatibilidad/RESULTADO.md:29,33`). Esto impide afirmar operabilidad hoy; no demuestra un defecto nuevo que exija cambiar código. La trazabilidad B775/B779 pendiente en B787 sigue siendo documental, no un bloqueo técnico demostrado.

## Selección exacta propuesta para commit

Rutas relativas a la raíz. Producto pendiente, conservar como conjunto por sus imports:

```text
app/api/admin/pedidos-operacion/route.ts
app/mesa/[mesaId]/cuenta/page.tsx
lib/adminAuth.ts
lib/authorizedAdminAccess.ts
lib/atomicContract.ts
lib/orderAmounts.ts
```

Incluye RPC atómicas/autoridad, total persistido en cuenta y retirada del log de datos de sesión. Los dos últimos archivos son nuevos y necesarios para los imports; no omitirlos. No se propone código adicional.

QA: selección mínima de evidencia y referencia del candidato, sin presentar un paquete reproducible de todos los laboratorios:

```text
qa/b7/b765-validacion/candidato-B765.sql
qa/b7/b765-validacion/RESULTADO.md
qa/b7/b785-finalizacion-20261101-164625/resultado-B785.json
qa/b7/b786-integracion-http-20261101-165611/resultado-B786.json
qa/b7/b786-integracion-http-20261101-165611/laboratorio-B786/evidencia/http.json
qa/b7/b787-cierre-consolidado-20261101-170958/CIERRE-CONSOLIDADO.md
qa/b7/b787-cierre-consolidado-20261101-170958/PENDIENTES-OPERATIVOS.md
qa/b7/b788-salida-piloto-20261101-171445/SALIDA-PILOTO.md
```

El RESULTADO B765 conserva su estado histórico de preparación; no reemplaza resultados posteriores. Los informes contienen referencias históricas a archivos fuera de esta selección. Los demás archivos QA quedan fuera de este commit focalizado; no se revisaron masivamente ni se recomienda agregarlos en bloque.

Excluir expresamente clusters, carpetas `privado`, `privado.ps1`, `.env*`, DPAPI/pgpass/claves/JWT, datos, binarios `qa/postgres17`, logs/transcripciones (`codex.log`, TAP/logs voluminosos), `node_modules`, `.next`, caches, `*.tsbuildinfo`, locks y proyectos/evidencias temporales generados. Solo se selecciona el `http.json` indicado dentro del laboratorio B786. Sin cambiar `.gitignore` ni usar `git add .`.

## Estado Git y siguiente acción

Rama: `release/restosmart-v0.9-pro-pilot`; remoto por nombre: `origin` (sin consultar URL ni red). `git status --short`: cuatro archivos de producto modificados y dos nuevos arriba, más numerosos QA sin seguimiento; hubo advertencias de acceso denegado a directorios QA antiguos, por lo que no se afirma inventario completo de su contenido. `git diff --stat`: 4 archivos, 70 inserciones/69 eliminaciones; no incluye archivos nuevos. `git diff --cached --stat`: vacío. Ninguna escritura Git realizada.

Siguiente acción concreta: registrar la constancia de destino/alcance anterior. En una corrida posterior con ejecución permitida, validar proporcionalmente los seis archivos de producto (lint focalizado y compilación de aplicación), y el recorrido elegido en ese destino autorizado: login, lectura de pedidos, una transición/RPC y cuenta con total persistido. No nueva suite completa ni laboratorio. No repetir pruebas históricas por defecto. Si aparece una incompatibilidad concreta de esquema/ACL, resolver solo esa brecha antes de operar.

Después revisar el diff y la selección explícita anterior, comprobar que no incorpora secretos/artefactos y realizar commit/push a esta rama en `origin`. La autorización general del usuario ya existe; en esta corrida prevalece su prohibición expresa de Git de escritura, por eso se deja preparado y no ejecutado. Commit/push por sí solos no habilitan el piloto ni certifican producción.
