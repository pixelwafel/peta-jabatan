/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import packageJson from './package.json';

export default defineConfig(({ command }) => ({
  // GitHub Pages project site menyajikan app dari /peta-jabatan/, bukan root
  // domain — jadi base path itu cuma relevan waktu build jalan di GitHub
  // Actions. Host lain (Vercel, Netlify, dev server lokal, dst) menyajikan
  // dari root, jadi base tetap '/' secara default.
  base: command === 'build' && process.env.GITHUB_ACTIONS === 'true' ? '/peta-jabatan/' : '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
}));
