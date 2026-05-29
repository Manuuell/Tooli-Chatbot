import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { config } from '../config';

const GRAPH_URL = 'https://graph.facebook.com/v20.0';

/** Directorio donde se guardan las imágenes dentro del contenedor */
const UPLOADS_DIR = path.join(__dirname, '../../uploads/nutria');

/** Asegura que el directorio de uploads exista */
function ensureDir(): void {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

/**
 * Descarga una imagen de la Media API de Meta y la guarda en disco.
 * Retorna la ruta relativa del archivo guardado (para construir la URL pública).
 */
export async function guardarImagenMeta(
  mediaId: string,
  token: string,
  phone: string
): Promise<string> {
  ensureDir();

  // Paso 1: obtener URL temporal del archivo
  const metaRes = await axios.get(`${GRAPH_URL}/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 15_000,
  });
  const { url, mime_type } = metaRes.data as { url: string; mime_type: string };

  // Paso 2: descargar el archivo
  const ext = mime_type?.includes('png') ? 'png' : 'jpg';
  const filename = `${phone}_${Date.now()}.${ext}`;
  const filepath = path.join(UPLOADS_DIR, filename);

  const imgRes = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` },
    responseType: 'arraybuffer',
    timeout: 30_000,
  });

  fs.writeFileSync(filepath, Buffer.from(imgRes.data));

  const publicUrl = `${config.appBaseUrl}/uploads/nutria/${filename}`;
  console.log(`[nutria] imagen guardada: ${filename} → ${publicUrl}`);
  return publicUrl;
}
