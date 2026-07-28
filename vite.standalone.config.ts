import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: fileURLToPath(new URL("./standalone", import.meta.url)),
  base: "./",
  publicDir: fileURLToPath(new URL("./public", import.meta.url)),
  plugins: [react(), viteSingleFile()],
  define: {
    "import.meta.env.VITE_HOPPER_EMBED_LESSON_ASSETS": JSON.stringify("true"),
  },
  build: {
    outDir: fileURLToPath(new URL("./student-build", import.meta.url)),
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    rollupOptions: {
      input: fileURLToPath(new URL("./standalone/hopper-studio.html", import.meta.url)),
    },
  },
  resolve: {
    alias: { "@": projectRoot },
  },
});
