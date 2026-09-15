- [x] 1. Arreglar etiquetas que se parten a mitad de palabra en usuarios.js (agregado CSS para .advisor-stat-value y .advisor-stat-label con ellipsis y hyphens: none)
- [x] 2. Verificar arreglo a 375px (móvil) - el CSS con ellipsis funciona en móvil; las tarjetas se apilan y el texto largo se trunca con puntos suspensivos
- [x] 3. Botones sin :active o elevación hover en usuarios.js, turno.js, recibo.js - revisado: todos los botones usan clases .btn-* que ya tienen :active (scale 0.96) y hover (elevación) definidos en styles.css líneas 84-98
- [x] 4. Textos que desbordan contenedor en las 3 pantallas - agregado ellipsis + hyphens:none a .crm-card-name, .crm-card-row, .turno-result .value, .recibo-result .value; en móvil 375px permiten word-break para que quepa
- [x] 5. Estados de carga con .skeleton en las 3 pantallas - usuarios.js y turno.js ya usaban skeleton; recibo.js actualizado para mostrar skeleton en #reciboResult durante la carga
- [x] 6. Estados vacíos informativos en las 3 pantallas - usuarios.js: agregado empty-state cuando no hay usuarios; turno.js y recibo.js ya tenían alertas informativas para errores y sin resultados

## ESTADO: TERMINADO