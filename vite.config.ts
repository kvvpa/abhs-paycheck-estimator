import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: "./" makes GitHub Pages deployment easy.
export default defineConfig({
  plugins: [react()],
  base: "./",
});
