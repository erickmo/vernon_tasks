import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { execFileSync } from "node:child_process";
import path from "node:path";

const swVersion = (() => {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"]).toString().trim();
  } catch {
    return "dev";
  }
})();

export default defineConfig({
  base: "/m/",
  define: { __SW_VERSION__: JSON.stringify(swVersion) },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  plugins: [
    react(),
    VitePWA({
      strategies: "generateSW",
      registerType: "autoUpdate",
      manifest: {
        name: "Vernon Tasks",
        short_name: "Vernon",
        description: "Tugas, sprint, dan analitik Vernon.",
        start_url: "/m/",
        scope: "/m/",
        display: "standalone",
        background_color: "#0b0b10",
        theme_color: "#0b0b10",
        lang: "id-ID",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      },
      workbox: {
        cacheId: `vt-${swVersion}`,
        navigateFallback: "/m/index.html",
        navigateFallbackDenylist: [/^\/api\//, /^\/app\//, /^\/private\//],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/api/method/vernon_tasks."),
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: `vt-api-${swVersion}`,
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 }
            }
          }
        ]
      }
    })
  ],
  build: {
    outDir: path.resolve(__dirname, "../vernon_tasks/www/m"),
    emptyOutDir: true,
    sourcemap: false
  },
  test: {
    environment: "happy-dom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"]
  }
});
