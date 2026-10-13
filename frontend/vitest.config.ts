import path from "path";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/unit/setup.ts"],
    include: ["tests/unit/**/*.spec.ts"],
    server: { deps: { inline: ["vuetify"] } }
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") }
  }
});
