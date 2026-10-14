import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Same-origin API in development so the HttpOnly session cookie just works.
    // API_PROXY lets an isolated test API run alongside the normal one.
    proxy: { '/api': process.env.API_PROXY || 'http://localhost:4000' },
  },
});
