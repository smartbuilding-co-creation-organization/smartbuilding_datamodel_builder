import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ command, mode }) => ({
  base:
    command === 'serve' && mode === 'development'
      ? '/'
      : '/smartbuilding_datamodel_builder/',
  plugins: [react()],
  resolve: {
    alias: {
      '@repo/core': path.resolve(__dirname, '../../packages/core/src/index.ts'),
    },
  },
  server: {
    port: 5173,
  },
}));
