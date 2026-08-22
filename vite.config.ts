import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vitest/config";

const base = process.env.BASE_URL ?? "/";

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      injectRegister: false,
      includeAssets: [
        "icons/icon.svg",
        "icons/icon-192.png",
        "icons/icon-512.png",
        "icons/apple-touch-icon.png",
        "seed/seed-krokelvdalen-2.json",
      ],
      manifest: {
        name: "FairPlay Sideline",
        short_name: "FairPlay",
        description: "Kampklokke og bytteplanlegger for rettferdig spilletid.",
        lang: "nb",
        start_url: base,
        scope: base,
        display: "standalone",
        orientation: "any",
        background_color: "#f4f0e5",
        theme_color: "#092b25",
        categories: ["sports", "utilities"],
        icons: [
          {
            src: `${base}icons/icon-192.png`,
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: `${base}icons/icon-512.png`,
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: `${base}icons/icon-512.png`,
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,json}"],
        navigateFallback: "index.html",
        cleanupOutdatedCaches: true,
        clientsClaim: false,
        skipWaiting: false,
        runtimeCaching: [],
      },
      devOptions: {
        enabled: true,
      },
    }),
  ],
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    clearMocks: true,
    restoreMocks: true,
    css: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/{domain,clock,storage}/**/*.{ts,tsx}"],
    },
  },
});
