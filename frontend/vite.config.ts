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
  // In dev, read DEV_API_URL from .env.local so the URL is real.
  // In production the Docker env.sh script replaces the TERA_API_URL placeholder.
  const API_URL = mode === "development"
    ? (env.DEV_API_URL ?? "http://localhost:8080")
    : "TERA_API_URL";
  return {
    base: "/",
    preview: {
      port: 5173,
      allowedHosts: ["TERA_APP_URL"],
    },
    server: {
      port: 5173,
      host: "0.0.0.0",
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
