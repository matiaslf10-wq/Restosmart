# B787 — cierre consolidado

La etapa de revocación del caso normal queda cerrada en el alcance B785/B786: ambos resultados registran FINALIZATION_VERIFIED, revocationConfirmed=true, errors=[] y clusterStopped=true. El usuario confirma exit 0 para ambos. B787 es consolidación documental, sin nuevas pruebas ni comprobaciones vivas.

| Evidencia | Resultado y alcance |
| --- | --- |
| B780: CIERRE-TECNICO.md y EVIDENCIAS.md | B774 instalación PASS; B775 SQL PASS y snapshot idéntico por antecedente confirmado; B777 offline 18/18. B778 acredita casos sintéticos A/B de pedidos-operacion, rollback, ACL y retiro de trigger, pero conserva FAIL/FAIL_FINALIZATION. Integridad histórica documentada, no verificada nuevamente. |
| B780: PENDIENTES.md y TRANSFERENCIA.md | B779 es recuperación posterior confirmada; no convierte B778 en PASS. La causa histórica de B778 sigue sin demostrarse. |
| resultado-B785.json | Ensayo real del mecanismo nuevo de finalización, revocación confirmada y cluster detenido; no certifica el flujo funcional del piloto. |
| resultado-B786.json + laboratorio-B786/evidencia/http.json | Caso normal real cerrado. Logout POST 200 sin autenticación ni recorrido a PostgREST; GET JWT directo a PostgREST 200, fila (786,true). controlledFailure=false. |
| Testimonio de consola del usuario tras B786 | PUERTO_3006=SIN_LISTENER y PUERTO_55487=SIN_LISTENER. Sin archivo independiente de evidencia ni comprobación histórica de PID atribuida a B787. |

El ejecutor nuevo está en `qa/b7/b786-integracion-http-20261101-165611/runner.cjs`: integra `ciclo.cjs`, `adapter.cjs`, `finalizacion.cjs` y `http.cjs`, con entrada `EJECUTAR-ENSAYO.ps1`. Reutiliza el mecanismo B785, adaptado a B786. `http.cjs` construye una copia Next de laboratorio con solo logout y adminAuth, y una tabla probe sintética. Está integrado al ejecutor de laboratorio B786; no se acredita incorporación al flujo del candidato B765/pedidos-operacion que se utilizaría para el piloto. No se modifica ni se repara retroactivamente el ejecutor B778.

RESUMEN.md y AUTORIZACION.md de B786 describen la preparación previa («no ejecutado»); para el caso normal prevalecen el resultado posterior y la confirmación del usuario. El fallo funcional controlado quedó preparado y probado offline, sin ensayo real. No es un requisito adicional para este cierre.

Actualización de los pendientes reales de B780:

- Revocación automática: resuelta para el mecanismo nuevo en el caso normal B785/B786. El diagnóstico causal histórico de B778 permanece desconocido y no bloquea por sí mismo.
- Nuevo ensayo integral: B786 cierra su ciclo focalizado HTTP, parada y revocación. No equivale a repetir el conjunto funcional B778 con el mecanismo nuevo ni acredita rollback/trigger del candidato dentro de ese mismo ciclo. No corresponde repetir aquí lo ya aprobado.
- Testigos independientes B775/B779: siguen sin vincularse en las fuentes indicadas. Se conservan los resultados confirmados; la falta documental no demuestra inseguridad actual.
- Antes de otra sesión local sigue aplicando la confirmación del operador de identidad, estado actual, alcance y autorización. Los informes históricos no sustituyen esa confirmación.

Conclusión: la habilitación del piloto local queda indeterminada (`pilotoLocalHabilitable=null`); todavía no puede declararse habilitable el flujo del candidato con estos documentos. Falta identificar el ejecutor efectivo del piloto y acreditar documentalmente su relación con el mecanismo certificado. No se demuestra un bloqueo técnico nuevo. Si el alcance elegido es únicamente el laboratorio B786, su caso normal ya está certificado, pero ello no habilita el piloto funcional B765. La siguiente acción mínima es definir y registrar ejecutor y alcance del piloto, sin repetir ensayos ni iniciar desarrollo en B787.

No se extrapola a otros endpoints, UI, autenticación de administrador, exposición pública ni producción. Fuentes: cuatro documentos de `qa/b7/b780-cierre/`; `qa/b7/b785-finalizacion-20261101-164625/resultado-B785.json`; y, en `qa/b7/b786-integracion-http-20261101-165611/`, `resultado-B786.json`, `laboratorio-B786/evidencia/http.json`, `RESUMEN.md`, `AUTORIZACION.md`, `runner.cjs`, `ciclo.cjs` y fragmentos pertinentes de `http.cjs`. Testimonios: mensaje del usuario de B787.
