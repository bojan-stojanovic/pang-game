import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  test: { environment: 'node' },
  build: {
    // Phaser alone is ~1.4 MB; keeping it in its own chunk lets the browser cache it across game updates.
    chunkSizeWarningLimit: 1600,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [{ name: 'phaser', test: /node_modules[\\/]phaser[\\/]/ }],
        },
      },
    },
  },
});
