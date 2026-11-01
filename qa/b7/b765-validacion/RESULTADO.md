# B7.65 ? validacion SQL preparada

Estado de motor: NO EJECUTADO. Cero pruebas PostgreSQL ejecutadas por Codex; no se acredita PASS SQL.

Desde PowerShell 5.1 del operador, en la raiz del repositorio:

~~~powershell
powershell.exe -NoProfile -File .\qa\b7\b765-validacion\run.ps1 -OperatorExecution
~~~

Opcional: -PsqlPath 'C:\Program Files\PostgreSQL\17\bin\psql.exe'. El switch declara ejecucion del operador; no detecta tecnicamente Codex. Solo el operador lee y descifra DPAPI. No ejecutar el runner desde Codex.

Destino fijo: 127.0.0.1:55458/b762m_lab, b759g_owner, PostgreSQL 17.11 UTF8. Transporte B762V: psql -X -f, includes relativos, sin stdin SQL; entorno PG privado y UTF8. No se ejecuta el instalador B764 ni bootstrap. No se recrea ni limpia el laboratorio.

ensayo.sql captura inventario vivo de funciones public (OID, definicion, propietario, ACL y configuracion) y fixtures antes y despues. Dentro de BEGIN reemplaza las tres funciones existentes, revoca ACL y fija el rol revisado; termina en ROLLBACK. Tambien revierte cambios de fixtures, triggers de fallos y rol b765_probe. Si ese rol ya existe, aborta sin tocarlo. Requiere permiso para CREATE ROLE y SET ROLE; falta de permiso es FAIL, no prueba omitida aprobada. No hay DROP ni COMMIT. Una salida prematura cierra la conexion y PostgreSQL revierte la transaccion pendiente; solo la evidencia completa acredita restauracion.

Copia candidato-B765.sql: fragmento para incluir exclusivamente dentro del ensayo, sin instalacion permanente. Correccion estatica comprobable: B764 abre authorize con AS $ y cierra con $$; B765 usa $$ en ambos extremos. CREATE OR REPLACE adapta las funciones al laboratorio existente, no propone instalacion. sonda-B764.sql pide al motor compilar el texto original y capturar 42601; ese SQLSTATE aun NO ha sido observado en esta entrega. No se atribuyen defectos comprobados en motor sin ejecucion. B764 permanece intacto.

La guarda original de instalacion exige B5 y columnas de pago que el bootstrap sintetico B762V no crea. Se omite esa guarda para ensayar cuerpos sobre fixtures existentes; NO certifica compatibilidad del instalador ni B5 funcional. B5 se compara tal como exista, incluida su ausencia, sin crear stub ni reemplazarla. Se rechaza adaptador de cobros inesperado.

Cobertura prevista: 39 registros, incluidos compilacion original, identidad/tenant, ACL PUBLIC, roles con/sin EXECUTE, suplantacion por GUC, invoker con/sin privilegios de tabla, marcador mayusculo LISTO, lotes y fallos intermedios heredados de B762V, restauracion externa y B5. No prueba HTTP, produccion, RLS ni concurrencia entre sesiones. Fixtures deben conservar el estado inicial B762V; si difieren, fallara sin limpiarlos.

Cada ejecucion deja evidence/<UTC-GUID> con manifiesto SHA256, inventarios antes/despues, stdout/stderr, SQLSTATE reales esperados y no capturados, pruebas.jsonl y resultado.json. PASS_LAB_ROLLBACK_ONLY requiere salida 0, exactamente 39 registros y cero fallos. Si no compila, no se ejecutan pruebas posteriores y queda FAIL. Logs contienen fixtures del laboratorio; nunca credenciales.

VALIDACION-ESTATICA.json registra solo analisis del runner y archivos; no ejecucion PostgreSQL. Codex no leyo .env ni DPAPI, ni ejecuto psql. No se modificaron B764, app/, lib/ u otras carpetas QA. Sin commit, push, deploy, remoto, Supabase o Vercel.
