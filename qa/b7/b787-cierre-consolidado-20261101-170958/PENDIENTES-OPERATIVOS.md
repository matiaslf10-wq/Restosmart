# B787 — pendientes operativos

Bloqueantes demostrados: ninguno nuevo en las fuentes leídas. B778 conserva su fallo histórico; B785/B786 cierran la revocación normal únicamente en su alcance.

Información faltante, en orden:

1. **Definir ejecutor y alcance del piloto local.** Registrar ruta, candidato y recorrido que se utilizarán, y su relación efectiva con el mecanismo B785/B786. Cierre: correspondencia documental suficiente para decidir habilitación limitada; hoy solo se acredita integración en laboratorio B786. Si se elige un flujo distinto, precisar únicamente la brecha aplicable antes de autorizar trabajo posterior.
2. **Vincular soporte sanitizado B775/B779.** Incorporar referencias al SQL/snapshot B775 y a NOLOGIN/password NULL y ambos testigos B779 ya confirmados. Cierre: referencias identificadas, sin secretos ni repetición de recuperación. Es trazabilidad pendiente, no bloqueo técnico demostrado.
3. **Confirmación operativa previa a la próxima sesión.** El operador confirma identidad, estado actual, alcance y autorización del destino elegido. Cierre: constancia de esa confirmación para la sesión; no exige nueva suite ni invalida los resultados históricos.

Mejoras opcionales, fuera del cierre: investigar la causa histórica B778; ensayar realmente el fallo funcional controlado B786. No son condiciones nuevas para cerrar el caso normal. Ampliar a otros endpoints/UI o producción requiere definir otro alcance, sin presumir fallos.

Ya cerrado: revocación normal B785/B786, resultados sin errores y parada de cluster. Los puertos 3006 y 55487 sin listener son testimonio de consola del usuario, sin evidencia independiente ni historia de PID añadidas.
