/**
 * Rutas del bot NutriA. Son PÚBLICAS a propósito: las consume la landing
 * de la campaña, sin sesión de asesor. Por eso se montan antes de requireAuth.
 */

import { Router } from 'express';
import { maskCode, maskPhone } from '../../services/logSafe';
import { canjearCodigoNutria, getCanjesRecientes, getCodigoNutria } from '../../services/nutriaCodigoService';
import { guardarEncuestaNutria, leerEncuestasNutria } from '../../services/nutriaSheets';

export const nutriaRouter = Router();

// ── Rutas PÚBLICAS de NutriA (sin autenticación) ──────────────────────────────

nutriaRouter.get('/nutria/encuestas', async (_req, res) => {
  try {
    const rows = await leerEncuestasNutria();
    res.json({ rows });
  } catch (err: any) {
    console.error('[tools/nutria/encuestas] error:', err);
    res.status(500).json({ error: 'internal_error', message: err?.message });
  }
});

nutriaRouter.post('/nutria/encuestas/seed', async (req, res) => {
  const { key } = req.body ?? {};
  if (key !== 'nutria-seed-2024') {
    res.status(403).json({ error: 'forbidden' });
    return;
  }
  try {
    await guardarEncuestaNutria({
      whatsapp:           'seed-test',
      edad:               '20 años',
      genero:             'Femenino',
      tiempoCelular:      'Entre 4 y 6 horas',
      verificarMetricas:  'Sí',
      tiempoRedes:        'Entre 1 y 3 horas',
      redPrincipal:       'Instagram',
      sabeUltraprocesado: 'No',
      vioPublicidad:      'Sí',
      redPublicidad:      'Instagram',
      publicidadMotivo:   'Sí',
      consumoBebidas:     '2 veces',
      consumoPanaderia:   '1 vez',
      consumoPostres:     '2 veces',
      consumoMecatos:     '3 veces',
      comproDespues:      'Sí',
      sellos:             'A veces',
      consumiriaSello:    'Sí',
      motivacion:         'Me dio antojo',
      comoEntero:         'Por un amigo',
      contacto:           'Sí',
    });
    res.json({ ok: true, message: 'Fila de prueba guardada en Google Sheets ✅' });
  } catch (err: any) {
    console.error('[tools/nutria/seed] error:', err);
    res.status(500).json({ error: 'internal_error', message: err?.message });
  }
});

// ── Validación y canje de códigos QR NutriA (sin autenticación) ──────────────

nutriaRouter.get('/nutria/codigo/:code', async (req, res) => {
  const code = req.params.code.toUpperCase();
  const data = await getCodigoNutria(code);
  if (!data) {
    res.status(404).json({ error: 'not_found', message: 'Código no existe o expiró' });
    return;
  }
  res.json({ ok: true, code, ...data });
});

nutriaRouter.get('/nutria/canjes', async (_req, res) => {
  const canjes = await getCanjesRecientes(10);
  res.json({ canjes });
});

nutriaRouter.post('/nutria/codigo/:code/canjear', async (req, res) => {
  const code = req.params.code.toUpperCase();
  const result = await canjearCodigoNutria(code);
  if (!result.ok) {
    const status = result.error === 'not_found' ? 404 : 409;
    res.status(status).json({ error: result.error, data: result.data });
    return;
  }
  console.log(`[nutria] código canjeado: ${maskCode(code)} — ${maskPhone(result.data?.phone)}`);
  res.json({ ok: true, code, ...result.data });
});
