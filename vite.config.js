import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base : nom du dépôt GitHub, nécessaire pour GitHub Pages.
// Modifiable via la variable VITE_BASE si tu renommes le dépôt.
const base = process.env.VITE_BASE || "/marathon-app/";

export default defineConfig({
  plugins: [react()],
  base,
  build: {
    rollupOptions: {
      output: {
        // Nom de fichier basé sur le contenu : dès qu'une ligne de code change,
        // le nom du fichier change → le navigateur ne PEUT PAS servir une vieille version.
        entryFileNames: "assets/[name].[hash].js",
        chunkFileNames: "assets/[name].[hash].js",
        assetFileNames: "assets/[name].[hash].[ext]",
      },
    },
  },
});
