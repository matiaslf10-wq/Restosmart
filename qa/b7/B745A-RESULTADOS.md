# B7.45A — HTTP local aislado

Fecha: 2026-10-25. Checkpoint inspeccionado: `3e067b4`.
Rama conservada: `release/restosmart-v0.9-pro-pilot`.

Resultado: **18/18 pruebas nuevas, 125 solicitudes HTTP por socket; 77/77 pruebas anteriores; 95/95 en total**. Sin fallos, omisiones ni cancelaciones en las ejecuciones finales. TypeScript y `git diff --check`: salida 0.

## Aislamiento y componentes

`b745a-http-local.mjs` abre servidores efímeros exclusivamente en `127.0.0.1`, puerto asignado por el sistema, y los cierra al terminar cada caso. El cliente usa `node:http.request`, destino literal loopback, sin proxy ni redirecciones. Envía bytes HTTP reales, headers, cookies, JSON y multipart; el servidor convierte el stream recibido a `NextRequest` y serializa la respuesta al socket. No son solicitudes resueltas únicamente por llamadas directas desde la prueba.

Se inspeccionaron Next 16.0.7, `next.config.ts` (sin opciones adicionales), rutas, autenticación y fixtures. No se inició Next dev/build/start ni se cargó su entorno. No se leyeron `.env`, `.env.local` ni secretos existentes. Los módulos de aplicación reciben exclusivamente `ADMIN_SESSION_SECRET=local-test-only-not-a-real-secret`, usado para firmas HMAC locales. No reciben el `process` del proceso anfitrión.

Se ejecutan los handlers TypeScript reales, transpilados en memoria con TypeScript instalado, `NextRequest`/`NextResponse` reales del paquete instalado, autenticación HMAC real, `resolveAuthorizedAdminAccess`, contexto público, validación/lectura acotada de imágenes, generación de paths, modelo/configuración de cobros y bloqueo de cocina reales. Cookies, `request.json()` y parser multipart procesan los bytes recibidos.

Se reutiliza únicamente la función `setup` del fixture B743 mediante lectura del archivo, sin ejecutar sus pruebas. Se agregan tablas vacías de pedidos/cobros y filas para casos concretos. La carga de módulos permite archivos TypeScript locales, crypto y Next; sustituye `supabaseAdmin` antes de cargar su implementación y rechaza imports desconocidos. No ofrece fetch, sockets, DNS ni SDK Supabase a los handlers. Es una frontera de dependencias para código confiable del repositorio, no una sandbox contra código hostil. El proceso anfitrión usa filesystem, compilador y Next locales.

**Sustituciones:** DB/query builder y Storage en memoria; `resolveAdminAccess` devuelve plan pro y capacidad multimarca locales; `server-only` se neutraliza para ejecutar en Node. `resolveAuthorizedAdminAccess` permanece real y verifica sesión/administrador/tenant/sucursal contra filas simuladas. Storage registra bytes, paths y opciones sin buckets; las URLs `https://images.local/...` son cadenas de fixture, nunca se navegan. RPC de escritura no se implementa: si una prueba alcanzara una inesperadamente, falla el adaptador con 598 y la prueba falla.

Estos mocks **no equivalen a RLS**, grants, funciones SQL, triggers ni políticas de Storage reales. B744B/B744D no se volvieron a ejecutar contra SQL en esta tarea.

## Cobertura HTTP

| Ruta | Evidencia |
| --- | --- |
| `/api/public/contexto` | GET sin sesión, proyección pública, sucursal ausente/pausada, ninguna escritura |
| `/api/public/mesa` | GET mínimo, número inválido/inexistente y aislamiento de sucursal |
| `/api/productos` | GET público limitado a productos visibles de sucursal, sucursal obligatoria; POST anónimo 401 |
| `/api/admin/productos` | GET autenticado; ausencia de sesión/cookie alterada 401, tenant/sucursal ajenos 403 |
| `/api/admin/productos/[id]/imagenes` | GET; POST multipart 201; PUT portada desde URL almacenada; DELETE metadata y limpieza física diferida; producto/imagen ajenos rechazados |
| `/api/admin/marcas/[id]/logo` | POST multipart 201, marca ajena 404, autenticación y autorización |
| `/api/pedidos` | GET protegido y autorización de tenant/sucursal; POST público incompleto 400 |
| `/api/admin/pedidos-operacion` | GET privado; POST cocina, pago pendiente bloquea 409, pago confirmado permite cambio de ítem propio, preserva pedido/ítem ajenos; origen externo 403 |
| `/api/admin/cobros` | GET privado con configuración/listas vacías, POST sin sesión 401, origen externo 403, JSON roto 400 |
| `/api/public/cobros` | GET expone solo configuración efectiva nula y headers no-store/no-referrer; POST no permite confirmar con orderId ni token inexistente |

Se comprueban cookies ausentes, tokens malformados y firmas alteradas; también sesión firmada localmente con tenant discordante. Las mutaciones protegidas de imágenes/logo/cocina/cobros rechazan anónimos y cookies manipuladas antes de DB/Storage.

Multipart se codifica realmente con FormData/Response y viaja por HTTP: PNG válido, cuerpo malformado, archivo vacío, contenido HTML, MIME discordante, archivo mayor a 5 MiB, path elegido por cliente. Productos y logos rechazan sin escribir. Content-Type JSON en upload produce el **409 existente**; multipart inválido produce 400. Los paths válidos usan hashes de tenant/recurso, UUID, extensión asignada por contenido y `upsert:false`. Fallo de upload produce 500 genérico y no inserta metadata. Cada respuesta se inspecciona para no exponer marcadores de secreto, stack ni nombres de credenciales.

Se recorren GET/POST/PUT/PATCH/DELETE no exportados en las rutas incluidas: 405 y Allow, sin mutaciones. **Este despacho lo implementa el adaptador**, no el router Next. También contiene soporte HEAD→GET, pero HEAD no tiene prueba dedicada. No se certifican los métodos automáticos, OPTIONS, middleware/proxy, caché ni comportamiento de despliegue de Next.

## Hallazgos y límites

No se identificó un fallo de API que requiriera cambios funcionales. En la primera ejecución se corrigieron tres supuestos del arnés: logo solo exporta POST, upload JSON responde 409 y DELETE requiere enviar longitud de cuerpo explícita con el cliente Node. La ejecución final pasa con los contratos existentes.

No se cubren creación exitosa de pedidos/RPC/stock transaccional, confirmaciones reales de cobros, configuración no nula de cobros, todas las transiciones operativas, fallos de DB de lectura, concurrencia/atomicidad de portada, sesiones expiradas, rate limiting, UI/navegador, TLS ni red externa. La batería previa conserva sus pruebas adicionales directas; no se cuentan como HTTP.

## Reproducción y resultados

Ejecutado desde la raíz con dependencias ya instaladas, sin instalar paquetes:

```powershell
node --test qa/b7/b745a-http-local.mjs
# tests 18; pass 18; fail 0; HTTP requests 125

node --test qa/b7/b720e-security-local.mjs qa/b7/b722r-billing-schema-local.mjs qa/b7/b722s-webhook-local.mjs qa/b7/b722v-webhook-state-local.mjs qa/b7/b724-cobros-local.mjs qa/b7/b742f-access-local.mjs qa/b7/b743b-storage-local.mjs
# tests 77; pass 77; fail 0

.\node_modules\.bin\tsc.cmd --noEmit
# exit 0, sin diagnósticos

git diff --check
# exit 0
```

Solo se agregaron este informe y el arnés HTTP. No se modificaron billing, checkout, webhooks, migraciones, secretos ni configuración funcional. El archivo preexistente no versionado `qa/b7/b722t_billing_compile_ROLLBACK.sql` se preservó. No hubo Supabase remoto, SQL remoto, buckets reales, navegación remota, commit, push, deploy ni cambio de rama.
