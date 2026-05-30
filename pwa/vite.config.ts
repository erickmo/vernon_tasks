import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import tsconfigPaths from "vite-tsconfig-paths";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
  resolve: {
    alias: [{ find: /^@\/(.*)$/, replacement: path.resolve(__dirname, "src") + "/$1" }],
  },
  plugins: [
    tsconfigPaths(),
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
        background_color: "#ffffff",
        theme_color: "#9561ab",
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
        importScripts: ["push-handler.js"],
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
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/node_modules/")) return "vendor";
          if (id.includes("/pwa/src/portal/okr/")) return "okr";
          if (id.includes("/pwa/src/portal/projects/")) return "projects";
          if (id.includes("/pwa/src/portal/")) return "portal";
          if (id.includes("/pwa/src/mobile/")) return "mobile";
          return undefined;
        }
      }
    }
  },
  test: {
    environment: "happy-dom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/e2e/**"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/api/**", "src/**/*.d.ts", "src/test-setup.ts"],
      thresholds: {
        "src/portal/**": { lines: 80, functions: 75, statements: 80, branches: 70 },
        "src/portal/okr/**": { lines: 80, functions: 75, statements: 80, branches: 70 },
        "src/portal/projects/**": { lines: 80, functions: 75, statements: 80, branches: 70 }
      }
    }
  }
});
