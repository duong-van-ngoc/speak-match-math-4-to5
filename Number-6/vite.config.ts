import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@iruka-edu/mini-game-sdk': fileURLToPath(new URL('./src/sdk/miniGameSdk.ts', import.meta.url)),
    },
  },
});
