import Redis from 'ioredis';
import { randomInt } from 'crypto';
import { config } from '../config';
import { sendOtpEmail } from './mailService';

// ─────────────────────────────────────────────────────────────────────────────
// Habilitador de identidad del bot (independiente del login Azure AD de la app).
//
// Prueba que quien escribe por WhatsApp controla un correo institucional
// (@utb.edu.co) mediante un OTP de 6 dígitos, y guarda el vínculo
// WhatsApp <-> correo verificado. Después, los flujos de datos personales
// (recibo, turno, notas…) exigen esta verificación.
// ─────────────────────────────────────────────────────────────────────────────

const redis = new Redis(config.redis.url);

const OTP_TTL = 600;                       // 10 minutos
const IDENTITY_TTL = 120 * 24 * 60 * 60;   // ~120 días → re-verificar cada semestre
const MAX_TRIES = 5;

export interface Identity {
  email: string;
  verifiedAt: number;
}

interface OtpState {
  email: string;
  code: string;
  tries: number;
}

const otpKey = (from: string) => `otp:${from}`;
const identityKey = (from: string) => `identity:${from}`;

/** Genera un OTP, lo guarda (TTL 10 min) y lo envía al correo institucional. */
export async function startVerification(from: string, email: string): Promise<void> {
  const code = String(randomInt(100000, 1000000)); // 6 dígitos
  const state: OtpState = { email, code, tries: 0 };
  await redis.setex(otpKey(from), OTP_TTL, JSON.stringify(state));
  await sendOtpEmail(email, code); // si falla, propaga el error (el flujo lo maneja)
}

export type CheckResult =
  | { ok: true; email: string }
  | { ok: false; reason: 'expired' | 'toomany' | 'wrong' };

/** Verifica el código escrito por el usuario contra el OTP guardado. */
export async function checkCode(from: string, input: string): Promise<CheckResult> {
  const raw = await redis.get(otpKey(from));
  if (!raw) return { ok: false, reason: 'expired' };

  const state = JSON.parse(raw) as OtpState;

  if (state.tries >= MAX_TRIES) {
    await redis.del(otpKey(from));
    return { ok: false, reason: 'toomany' };
  }

  if (input.trim() !== state.code) {
    state.tries += 1;
    const ttl = await redis.ttl(otpKey(from));
    await redis.setex(otpKey(from), ttl > 0 ? ttl : OTP_TTL, JSON.stringify(state));
    return { ok: false, reason: 'wrong' };
  }

  const identity: Identity = { email: state.email, verifiedAt: Date.now() };
  await redis.setex(identityKey(from), IDENTITY_TTL, JSON.stringify(identity));
  await redis.del(otpKey(from));
  return { ok: true, email: state.email };
}

export async function getIdentity(from: string): Promise<Identity | null> {
  const raw = await redis.get(identityKey(from));
  return raw ? (JSON.parse(raw) as Identity) : null;
}

export async function isVerified(from: string): Promise<boolean> {
  return (await redis.exists(identityKey(from))) === 1;
}

export async function revokeIdentity(from: string): Promise<void> {
  await redis.del(identityKey(from));
}

/**
 * Barrera anti-suplantación: el correo institucional que aparece en el portal
 * (Banner/ICEBERG) tras el login con código+cédula DEBE coincidir con el correo
 * que el usuario verificó por OTP. Así, un estudiante verificado no puede
 * consultar datos de otro metiendo el código+cédula ajenos.
 *
 * TODO(integración): hoy icebergService no devuelve el correo del portal. Para
 * cerrar del todo la suplantación, extrae el correo institucional del portal
 * (página de datos personales de Banner) y pásalo aquí antes de entregar el PDF.
 */
export function emailMatchesIdentity(identity: Identity, portalEmail?: string | null): boolean {
  if (!portalEmail) return false;
  return portalEmail.trim().toLowerCase() === identity.email.trim().toLowerCase();
}
