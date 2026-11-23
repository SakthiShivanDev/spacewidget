import { defineConfig } from "vite";
export default defineConfig({
  root: ".",
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:4100",
      "/runtime": "http://127.0.0.1:4100",
      "/flutter-preview": "http://127.0.0.1:4100",
    },
  },
  // Flutter preview has its own build and server route; copying it into dist
  // would let stale exact static routes shadow the current preview assets.
  build: { outDir: "dist", emptyOutDir: true, copyPublicDir: false },
});
