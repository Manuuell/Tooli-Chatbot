/**
 * Envía la plantilla nutria_invitacion a una lista de números.
 * Uso: npx ts-node scripts/enviarInvitacion.ts
 */
import 'dotenv/config';
import axios from 'axios';

const TOKEN    = process.env.NUTRIA_WHATSAPP_TOKEN!;
const PHONE_ID = process.env.NUTRIA_PHONE_NUMBER_ID!;
const URL      = `https://graph.facebook.com/v20.0/${PHONE_ID}/messages`;

// ── Números a los que enviar (formato colombiano sin +) ───────────────────────
const NUMEROS = [
  '573007208566',
  '573215640735',
];

// ── URL pública del flyer (header de la plantilla) ───────────────────────────
const FLYER_URL = 'https://tooli-stand.duckdns.org/nutria/nutriaflyer.jpeg';

async function enviar(to: string) {
  const body = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: 'nutria_invitacion',
      language: { code: 'es' },
      components: [
        {
          type: 'header',
          parameters: [
            { type: 'image', image: { link: FLYER_URL } },
          ],
        },
      ],
    },
  };

  try {
    const res = await axios.post(URL, body, {
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    });
    console.log(`✅ Enviado a ${to}:`, res.data.messages?.[0]?.id);
  } catch (err: any) {
    console.error(`❌ Error con ${to}:`, err.response?.data ?? err.message);
  }
}

(async () => {
  for (const num of NUMEROS) {
    await enviar(num);
  }
})();
