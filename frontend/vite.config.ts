import path from "path";
import fs from "fs";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  const pkgJson = JSON.parse(
    fs.readFileSync(new URL("./package.json", import.meta.url), "utf-8"),
  );
  const appVersion = pkgJson.version || "dev";
  // In dev, proxy /api through Vite to avoid CORS (backend runs on DEV_API_URL or localhost:8000).
  // In production the Docker env.sh script replaces the TERA_API_URL placeholder.
  const DEV_BACKEND = env.DEV_API_URL ?? "http://localhost:8000";
  const API_URL = mode === "development" ? "" : "TERA_API_URL";
  return {
    base: "/",
    preview: {
      port: 5173,
      allowedHosts: true,
    },
    server: {
      port: 5173,
      host: "0.0.0.0",
      proxy: {
        "/api": {
          target: DEV_BACKEND,
          changeOrigin: true,
        },
      },
    },
    define: {
      "import.meta.env.VITE_APP_TAG": JSON.stringify(appVersion),
      "import.meta.env.VITE_API_URL": JSON.stringify(API_URL),
    },
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "."),
      },
    },
  };
});
