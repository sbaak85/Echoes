import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

import {
  resolvePublicAssetUrl,
  resolveRuntimePublicAssetUrl,
} from "../app/public-asset-url.ts";

test("public assets resolve under both local root and GitHub Pages base path", () => {
  assert.equal(resolvePublicAssetUrl("/", "/ui/gameover.png"), "/ui/gameover.png");
  assert.equal(
    resolvePublicAssetUrl("/Echoes/", "/ui/gameover.png"),
    "/Echoes/ui/gameover.png",
  );
  assert.equal(resolveRuntimePublicAssetUrl("/ui/gameover.png"), "/ui/gameover.png");
});

test("browser game sources do not hard-code root-relative UI assets", async () => {
  const appDirectory = new URL("../app/", import.meta.url);
  const sourceEntries = await readdir(appDirectory, { withFileTypes: true });
  const sourceUrls = sourceEntries
    .filter((entry) => entry.isFile() && /\.(?:css|ts|tsx)$/.test(entry.name))
    .map((entry) => new URL(entry.name, appDirectory));
  const sources = await Promise.all(sourceUrls.map((sourceUrl) => readFile(sourceUrl, "utf8")));

  for (const source of sources) {
    assert.doesNotMatch(source, /["']\/ui\//);
    assert.doesNotMatch(source, /url\(["']?\/ui\//);
  }
});
