import axios from 'axios';
import { config } from '../config';

// Envío de correo transaccional vía Resend (https://resend.com).
// En producción, MAIL_FROM debe ser de un dominio verificado en Resend
// (p. ej. verificacion@tudominio.com) para poder enviar a cualquier @utb.edu.co
// y no caer en spam. Sin dominio verificado, Resend solo permite enviar al
// correo de registro de la cuenta (útil solo para pruebas).
export async function sendOtpEmail(to: string, code: string): Promise<void> {
  if (!config.mail.apiKey) {
    throw new Error('RESEND_API_KEY no configurada');
  }

  const html = `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 420px; margin: 0 auto;">
      <h2 style="color: #005BFF;">Verificación Tooli UTB</h2>
      <p>Tu código de verificación es:</p>
      <p style="font-size: 30px; font-weight: bold; letter-spacing: 6px; color: #093AD8;">${code}</p>
      <p style="color: #888; font-size: 13px;">Vence en 10 minutos. Si no lo solicitaste, ignora este mensaje.</p>
    </div>`;

  await axios.post(
    'https://api.resend.com/emails',
    { from: config.mail.from, to, subject: 'Tu código de verificación Tooli', html },
    {
      headers: {
        Authorization: `Bearer ${config.mail.apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'tooli-bot',
      },
      timeout: 20000,
    }
  );
}
