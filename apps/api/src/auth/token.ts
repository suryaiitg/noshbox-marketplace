import jwt from 'jsonwebtoken';
import type { Role } from '@app/db';

export interface TokenPayload {
  sub: string; // user id
  role: Role;
  email: string;
}

function secret(): string {
  return process.env.JWT_SECRET ?? 'dev-secret-change-me';
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, secret(), { expiresIn: '7d' });
}

export function verifyToken(token: string): TokenPayload {
  const decoded = jwt.verify(token, secret());
  if (typeof decoded === 'string') {
    throw new Error('unexpected_token_payload');
  }
  // We trust the shape because we signed it ourselves.
  return decoded as unknown as TokenPayload;
}
