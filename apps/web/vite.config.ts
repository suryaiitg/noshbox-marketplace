import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // Read env (e.g. VITE_API_URL) from the monorepo root .env, not just apps/web.
  envDir: '../../',
  server: { port: 5173 },
});
