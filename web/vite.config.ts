import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// The OpenInference gateway (Fastify) runs on :3000 and owns the API under /v1.
// In dev we proxy API calls there; in prod the gateway serves the built SPA.
const API_TARGET = process.env.API_TARGET || "http://localhost:3000";
const proxy = Object.fromEntries(
  ["/v1", "/health", "/api-docs"].map((p) => [p, { target: API_TARGET, changeOrigin: true }]),
);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  server: { port: 5174, proxy },
  build: { outDir: "dist", emptyOutDir: true },
});
