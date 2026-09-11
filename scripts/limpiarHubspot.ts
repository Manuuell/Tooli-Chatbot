import axios from 'axios';

const TOKEN = process.env.HUBSPOT_TOKEN;
if (!TOKEN) { console.error('Falta HUBSPOT_TOKEN'); process.exit(1); }
const H = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };
const API = 'https://api.hubapi.com/crm/v3/objects/contacts';

(async () => {
  let total = 0;
  for (let i = 0; i < 10; i++) {
    const search = await axios.post(`${API}/search`, {
      filterGroups: [{ filters: [{ propertyName: 'fuente_lead', operator: 'EQ', value: 'Bot WhatsApp - Evento Posgrados' }] }],
      properties: ['email', 'firstname'],
      limit: 100,
    }, { headers: H });

    const results = (search.data.results ?? []) as any[];
    if (results.length === 0) break;

    results.forEach((r) => console.log('  -', r.properties.firstname ?? '(sin nombre)', '·', r.properties.email, `(id ${r.id})`));

    await axios.post(`${API}/batch/archive`, { inputs: results.map((r) => ({ id: r.id })) }, { headers: H });
    total += results.length;

    await new Promise((res) => setTimeout(res, 1500)); // espera a que el índice se actualice
  }

  console.log(total === 0 ? 'No había contactos del bot que borrar.' : `\n✅ ${total} contactos del bot borrados (archivados).`);
  process.exit(0);
})().catch((e) => { console.error('❌', e.response?.data ?? e.message); process.exit(1); });
