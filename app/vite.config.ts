import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/icon-32.png", "icons/icon-180.png"],
      manifest: {
        name: "Home Finance",
        short_name: "Finances",
        description: "Bank transaction categorization and monthly budget dashboard",
        start_url: "/",
        display: "standalone",
        background_color: "#f9f9f7",
        theme_color: "#256abf",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // App shell + static assets only — Firestore data is never cached by
        // the service worker, so the dashboard always reflects live data
        // when online and simply fails gracefully (see AuthGate) offline.
        globPatterns: ["**/*.{js,css,html,png,svg,ico}"],
      },
    }),
  ],
});
