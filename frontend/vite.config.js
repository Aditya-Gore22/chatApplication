import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  plugins: [
    // Polyfills process, Buffer, events, stream, etc. for simple-peer / readable-stream
    nodePolyfills({
      include: ['process', 'buffer', 'events', 'stream', 'util'],
      globals: {
        process: true,
        Buffer: true,
        global: true,
      },
    }),
    react(),
  ],
  server: {
    port: 5173,
    host: true, // expose on LAN (same as --host flag)
    proxy: {
      '/socket.io': {
        target: 'http://localhost:5000',
        ws: true,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  optimizeDeps: {
    include: ['simple-peer', 'socket.io-client'],
  },
});
