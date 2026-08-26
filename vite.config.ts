/**
 * Client bundle build.
 *
 * Vite builds only the browser half of the app: the dashboard SPA and the
 * customer wallet PWA. The Worker itself is bundled by Wrangler from
 * `src/server/index.ts`, which is why there is no HTML entry here — every page's
 * markup is server-rendered, and these two bundles are attached to it by
 * `<script type="module">`.
 *
 * Output goes to `dist/client`, which `wrangler.toml` serves as `[assets]`.
 *
 * Filenames are deliberately NOT content-hashed. The Worker builds asset URLs
 * from `src/shared/assets.ts` at request time and has no way to read a Vite
 * manifest, so the contract between the two is a fixed name plus an explicit
 * `?v=` cache buster. Shared chunks are hashed, because only the entry files
 * reference those and Rollup rewrites those references itself.
 */

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],

  build: {
    outDir: "dist/client",
    emptyOutDir: true,
    // Source maps ship: a stack trace from a salon owner's phone is otherwise
    // unreadable, and the bundle is not a secret.
    sourcemap: true,
    // Both entries import the same stylesheet. Without this, Rollup emits one
    // copy per entry and the Worker's single `assets.css` path becomes a lie.
    cssCodeSplit: false,
    target: "es2022",
    rollupOptions: {
      input: {
        app: "src/client/app/main.tsx",
        wallet: "src/client/wallet/main.tsx"
      },
      output: {
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/chunks/[name]-[hash].js",
        assetFileNames: (info) => {
          const name = info.names?.[0] ?? "";
          // The one stylesheet, at the one name the Worker knows.
          if (name.endsWith(".css")) return "assets/app.css";
          return "assets/[name]-[hash][extname]";
        }
      }
    }
  }
});
