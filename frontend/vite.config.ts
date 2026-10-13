import path from "path";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src")
    }
  },
  server: {
    port: 3030,
    strictPort: true,
    proxy: {
      // The backend serves routes without the /api prefix (nginx strips it in production).
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, "")
      }
    }
  },
  build: {
    sourcemap: process.env.VITE_SOURCEMAP !== "false",
    target: "es2022"
  }
});
