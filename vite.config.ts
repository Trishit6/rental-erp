import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
// Code-split every route so the storefront's first paint does not download the
// admin/seller panels or the whole feature tree up front.

export default defineConfig({
  plugins: [
    // Router plugin must come before the React plugin
    tanstackRouter({
      target: "react",
      rootDirectory: "./src/routes",
      generatedRouteTree: "./src/routeTree.gen.ts",
      // Route-level code splitting: each route's component/loaders ship in its
      // own chunk, so the admin panel, seller panel and feature pages are not
      // downloaded with the storefront's first paint.
      autoCodeSplitting: true,
    }),
    react(),
    tailwindcss(),
  ],
  build: {
    sourcemap: false,
  },
  resolve: {
    alias: {
      "@": "/src",
    },
  },
  server: {
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    // The suite runs one isolated worker per file (~90 of them). Booting them all
    // puts the machine under real contention, and a handful of interaction-heavy
    // component tests then overrun the 5s default through no fault of their own.
    // 15s is still a hang detector, just not a CPU-starvation detector.
    testTimeout: 15_000,
  },
});
