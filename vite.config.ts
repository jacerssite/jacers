import { defineConfig } from "vite";

export default defineConfig({
  build: {
    // A browser must receive the code it runs, but do not publish the original
    // TypeScript source or source maps alongside the production bundle.
    sourcemap: false,
    minify: true,
    cssMinify: true,
    target: "es2023",
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: false,
      },
    },
  },
});
