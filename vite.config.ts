/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import packageJson from './package.json';

export default defineConfig(({ command }) => ({
  // GitHub Pages project site menyajikan app dari /peta-jabatan/, bukan root
  // domain — cuma dipakai saat build, dev server tetap di / seperti biasa.
  base: command === 'build' ? '/peta-jabatan/' : '/',
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
