import react from "@vitejs/plugin-react";
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
