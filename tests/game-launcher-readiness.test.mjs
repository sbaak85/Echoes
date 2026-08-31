import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const launcher = await readFile(
  new URL("../scripts/start-game.ps1", import.meta.url),
  "utf8",
);
const viteConfig = await readFile(
  new URL("../vite.config.ts", import.meta.url),
  "utf8",
);

test("遊戲啟動器會確認客戶端 JS/CSS 可讀後才開啟瀏覽器", () => {
  assert.match(launcher, /<script\[\^>\]\*\\bsrc=/);
  assert.match(launcher, /stylesheet/);
  assert.match(launcher, /RawContentLength -le 0/);
  assert.match(launcher, /if \(Test-GameReady\) \{\s*Start-Process \$gameUrl/);
  assert.match(launcher, /function Stop-TrackedGameServer/);
  assert.match(launcher, /Stop-TrackedGameServer\s+\$serverArguments/);
});

test("Vite 不監看容易被編輯器鎖定的原始素材與執行期資料", () => {
  for (const ignoredPath of [
    "**/Assets/**",
    "**/.runtime/**",
    "**/SaveData/**",
  ]) {
    assert.ok(viteConfig.includes(ignoredPath), ignoredPath);
  }
});
