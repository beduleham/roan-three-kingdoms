import { defineConfig } from "vite";
import { resolve } from "node:path";
export default defineConfig({
  server: {
    fs: {
      // Keep Vite's sensitive-file defaults and deny local account DB/WAL files.
      deny: [
        ".env",
        ".env.*",
        "*.{crt,pem,key,p12,pfx,cer,der}",
        ".npmrc",
        ".yarnrc.yml",
        "**/.git/**",
        "**/data/**",
        "**/*.sqlite",
        "**/*.sqlite-*",
      ],
    },
  },
  build: {
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, "index.html"),
        online: resolve(import.meta.dirname, "online.html"),
      },
    },
  },
});
