import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Driver dashboard runs on its own port so it can sit next to the rider app (5173) and admin app (5175).
export default defineConfig({
  plugins: [react()],
  server: { port: 5174 },
});
