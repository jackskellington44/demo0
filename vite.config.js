import { defineConfig, loadEnv } from "vite";
import { resolve } from "path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiProxyTarget =
    env.VITE_BACKEND_PROXY_TARGET ||
    env.BACKEND_URL ||
    "http://localhost:3001";

  return {
    base: "/",
    server: {
      host: true,
      proxy: {
        "/api": {
          target: apiProxyTarget,
          changeOrigin: true
        }
      }
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "index.html"),
          main: resolve(__dirname, "main.html"),
        },
      },
    },
  };
});