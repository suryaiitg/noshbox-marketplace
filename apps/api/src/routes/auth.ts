import { Router } from 'express';
import { z } from 'zod';
import { query } from '@app/db';
import type { UserRow } from '@app/db';
import { signToken } from '../auth/token';

export const authRouter = Router();

const loginSchema = z.object({ email: z.string().email() });

/**
 * DEV-ONLY login: look up a seeded user by email and mint a token for them.
 * Passwords and real session handling are intentionally out of scope here.
 */
authRouter.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    return;
  }
  const users = await query<UserRow>('SELECT * FROM users WHERE email = $1', [parsed.data.email]);
  const user = users[0];
  if (!user) {
    res.status(404).json({ error: 'user_not_found' });
    return;
  }
  res.json({ token: signToken({ sub: user.id, role: user.role, email: user.email }) });
});
