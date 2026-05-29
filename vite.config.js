import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  // Use root base path for custom-domain GitHub Pages hosting.
  base: "/",
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, "index.html"),
        main: resolve(__dirname, "main.html"),
      },
    },
  },
});