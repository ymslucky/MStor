import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  root: "client",
  plugins: [react(), tailwindcss()],
  build: { outDir: "../client/dist", emptyOutDir: true },
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8787",
      "/auth": "http://127.0.0.1:8787",
      "/dav": "http://127.0.0.1:8787",
    },
  },
});
