import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { UserRole } from '../services/usersService';

const COOKIE_NAME = 'tooli_session';
const TOKEN_TTL = '8h';

export interface AuthPayload {
  username: string;
  role: UserRole;
  fullName: string;
}

export interface AuthedRequest extends Request {
  user?: AuthPayload;
}

export function signSession(payload: AuthPayload): string {
  return jwt.sign(payload, config.auth.jwtSecret, { expiresIn: TOKEN_TTL });
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 8 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) {
    res.status(401).json({ error: 'no_session' });
    return;
  }
  try {
    const payload = jwt.verify(token, config.auth.jwtSecret) as AuthPayload;
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'invalid_session' });
  }
}

export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction): void {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ error: 'forbidden' });
    return;
  }
  next();
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
