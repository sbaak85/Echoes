import vinext from "vinext";
import { defineConfig } from "vite";
import hostingConfig from "./.openai/hosting.json";
import { sites } from "./build/sites-vite-plugin";
import { playerVisualConfigWriterPlugin } from "./scripts/player-visual-config-vite-plugin";
import { saveDataFileApiPlugin } from "./scripts/save-data-vite-plugin";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

const localBindingConfig = {
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: "site-creator-d1",
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: "site-creator-r2",
        },
      ]
    : [],
};

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: {
      // The Windows launcher always opens 127.0.0.1:3000. Never let Vite
      // silently move the game to 3001+ while the launcher keeps polling 3000.
      strictPort: true,
      watch: {
        // Assets is the editable source-media library, not a runtime import
        // root. Large PNG/MP3 files are commonly open in image/audio tools on
        // Windows; attempting to watch those locked files can terminate Vite
        // with EBUSY and leave the browser showing unstyled server HTML.
        ignored: [
          "**/Assets/**",
          "**/.runtime/**",
          "**/SaveData/**",
          "**/dist/**",
          "**/pages-dist/**",
        ],
        ...(isCodexSeatbeltSandbox
          ? { useFsEvents: false, usePolling: true }
          : {}),
      },
    },
    plugins: [
      saveDataFileApiPlugin(),
      playerVisualConfigWriterPlugin(),
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: localBindingConfig,
      }),
    ],
  };
});
