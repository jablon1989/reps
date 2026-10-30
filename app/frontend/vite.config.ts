import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { defineConfig, loadEnv } from "vite";

// Local dev:
//   `make local` -> `vite --mode fake` (.env.fake): fake backend on :8788, no AWS, no login
//   `make dev`   -> API_PROXY_TARGET=<the deployed URL> in .env.local: the real API
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const target = env.API_PROXY_TARGET;
  const local = target?.startsWith("http://localhost");
  return {
    plugins: [react()],
    // The app's version (package.json), shown in Settings. Each change adds 0.0.1;
    // the deploy workflow tags it as v<version> on GitHub.
    define: { __APP_VERSION__: JSON.stringify(JSON.parse(readFileSync("package.json", "utf8")).version) },
    server: {
      port: 5174,
      strictPort: true,
      host: true, // reachable from your phone on the same Wi-Fi
      proxy: target
        ? {
            "/api": { target, changeOrigin: true },
            // The fake backend also serves config.json.
            ...(local ? { "/config.json": { target } } : {}),
          }
        : undefined,
    },
  };
});
