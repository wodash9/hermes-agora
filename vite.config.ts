import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const apiProxyTarget = process.env.VITE_DEV_API_PROXY_TARGET ?? 'http://127.0.0.1:3000';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx']
  },
  server: {
    proxy: {
      '/api': apiProxyTarget,
      '/socket.io': { target: apiProxyTarget, ws: true }
    }
  }
});
