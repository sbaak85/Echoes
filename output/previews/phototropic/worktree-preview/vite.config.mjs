import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

if (!process.env.ECHOES_PREVIEW_SOURCE_ROOT) throw new Error("Set ECHOES_PREVIEW_SOURCE_ROOT to the authoritative EchoesBeyond checkout.");
const sourceRoot = resolve(process.env.ECHOES_PREVIEW_SOURCE_ROOT);
const root = dirname(fileURLToPath(import.meta.url));
const sourceRequire = createRequire(join(sourceRoot, "package.json"));
const { defineConfig } = await import(pathToFileURL(sourceRequire.resolve("vite")).href);
const { default: react } = await import(pathToFileURL(sourceRequire.resolve("@vitejs/plugin-react")).href);

export default defineConfig({
  root,
  cacheDir: join(root, ".vite"),
  publicDir: join(sourceRoot, "public"),
  css: { postcss: { plugins: [] } },
  plugins: [react()],
  resolve: {
    alias: {
      "@echoes": join(sourceRoot, "app"),
      react: join(sourceRoot, "node_modules/react"),
      "react-dom": join(sourceRoot, "node_modules/react-dom"),
    },
    dedupe: ["react", "react-dom"],
  },
  server: { host: "127.0.0.1", port: 4320, strictPort: true, fs: { allow: [root, sourceRoot] } },
});
