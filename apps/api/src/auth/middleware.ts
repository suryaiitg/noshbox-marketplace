import type { NextFunction, Request, Response } from 'express';
import type { Role } from '@app/db';
import { verifyToken } from './token';
import type { Principal } from './policy';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: Principal;
    }
  }
}

/** Verify the Bearer token and attach req.user. 401 on any problem. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'missing_bearer_token' });
    return;
  }
  try {
    const payload = verifyToken(header.slice('Bearer '.length));
    req.user = { id: payload.sub, role: payload.role, email: payload.email };
    next();
  } catch {
    res.status(401).json({ error: 'invalid_token' });
  }
}

/** Gate a route to one or more roles. Use AFTER requireAuth. 403 if the role is not allowed. */
export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'not_authenticated' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'forbidden_role', need: roles, have: req.user.role });
      return;
    }
    next();
  };
}
