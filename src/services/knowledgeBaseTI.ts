/**
 * Base de conocimiento estática del Soporte TI de UTB.
 * Cubre las plataformas más comunes y troubleshooting básico.
 */

export const KB_TI = `
# SOPORTE TI — Universidad Tecnológica de Bolívar

## PLATAFORMAS Y URLS OFICIALES

### Banner / Autoservicio Académico
- URL principal: https://autoservicio4prod.utb.edu.co
- URL inscripción: https://bannerssbregistro.utb.edu.co
- Sirve para: matrícula académica, ver horarios, calificaciones, inscribir asignaturas
- Login: con código estudiantil + contraseña institucional UTB

### Iceberg — Portal Financiero
- URL: https://iceberg-niif.utb.edu.co/iceberg-pf/
- Sirve para: ver y descargar recibos de matrícula, generar pagos, ver créditos vigentes
- Login: código estudiantil + cédula

### Correo institucional (Office 365)
- URL: https://outlook.office.com
- Dominios: @utb.edu.co (presenciales) o @utbvirtual.edu.co (virtuales)
- También accesible desde Microsoft Teams y demás apps de Office 365

### Savio — Aulas Virtuales (Moodle)
- URL: https://savio.utb.edu.co/my/
- Sirve para: cursos virtuales, tareas, foros, recursos de clase
- Login: usuario y contraseña institucional UTB
- Tiene opción de "Olvidé mi contraseña" en la pantalla de login

### Red Wifi institucional
- Redes disponibles: UTB-Estudiantes, eduroam
- Login: con credenciales institucionales

## RESETEO DE CONTRASEÑA

### Auto-servicio (intentar PRIMERO)
Cada portal tiene su propia opción de "Olvidé mi contraseña":
- Savio: en https://savio.utb.edu.co/login → "¿Olvidó su contraseña?"
- Office 365: en https://passwordreset.microsoftonline.com
- Banner: usar la opción de recuperación en el login

### Si el auto-servicio NO funciona
Cuando el usuario indica que ya intentó el reset por el portal y no le llegó el correo, no funcionó, o tiene la cuenta bloqueada → DEBES llamar a la herramienta iniciar_verificacion_identidad para escalar el caso a un asesor de TI con verificación previa de identidad.

## TROUBLESHOOTING COMÚN

### "No puedo entrar a [plataforma]"
1. Verifica que estás usando la URL correcta (revisar arriba).
2. Limpia caché del navegador o prueba en modo incógnito.
3. Prueba en otro navegador (Chrome, Edge, Firefox).
4. Si sigue sin funcionar → escalar a TI con verificación.

### "No me llega el correo institucional"
1. Verifica que estás usando outlook.office.com (no Gmail u otro).
2. Revisa la carpeta de Spam / Correo no deseado.
3. Asegúrate de que tu cuenta esté activa (estudiantes nuevos pueden tardar 24-48h en activarse).
4. Si persiste → escalar a TI.

### "Wifi no conecta"
1. Olvida la red en tu dispositivo y vuelve a conectarte.
2. Usa credenciales institucionales (no @utb.edu.co, solo el usuario).
3. Si en eduroam falla, prueba con UTB-Estudiantes.
4. Si persiste → escalar a TI.

### "Aulas virtuales / Savio no carga mi curso"
1. Verifica que el período académico esté activo.
2. Si no aparece el curso, puede ser que el profesor aún no lo habilitó.
3. Limpia caché o prueba otro navegador.
4. Si persiste → escalar a TI.

## REGLAS PARA EL ASISTENTE

1. NUNCA pidas la contraseña del usuario.
2. Si la duda es sobre admisiones, costos, becas o programas: dile que escriba *menu* y elija la opción 3 → 2 (Admisiones).
3. Si el problema requiere acceso al sistema (resetear contraseña, desbloquear cuenta, configurar correo en dispositivo, problema persistente que el usuario ya intentó solucionar) → llama a iniciar_verificacion_identidad para escalar con verificación.
4. Sé breve: máximo 4-5 líneas. Pasos numerados ayudan.
5. Tono: cercano, en español colombiano. Trata al usuario de "tú".
`.trim();
