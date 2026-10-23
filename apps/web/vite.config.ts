import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const values = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    build: {
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              {
                name: 'initial-vendor',
                test: /node_modules[\\/]/,
                tags: ['$initial'],
                minSize: 80_000,
                maxSize: 450_000,
              },
            ],
          },
        },
      },
    },
    server: {
      host: '0.0.0.0',
      port: 5185,
      strictPort: true,
      proxy: {
        '/api':
          process.env.VITE_API_PROXY ||
          values.VITE_API_PROXY ||
          'http://localhost:3045',
      },
    },
  };
});
