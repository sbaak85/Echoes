import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { PLAYER_VISUAL_PROJECT_CONFIG } from "../app/player-visual-config.ts";

const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

test("角色尺寸、速度與八方向陰影集中使用專案 TS 設定", () => {
  assert.ok(PLAYER_VISUAL_PROJECT_CONFIG.speed >= 100);
  assert.ok(PLAYER_VISUAL_PROJECT_CONFIG.speed <= 380);
  assert.ok(PLAYER_VISUAL_PROJECT_CONFIG.size >= 90);
  assert.ok(PLAYER_VISUAL_PROJECT_CONFIG.size <= 220);
  assert.deepEqual(Object.keys(PLAYER_VISUAL_PROJECT_CONFIG.shadows), directions);
  directions.forEach((direction) => {
    const shadow = PLAYER_VISUAL_PROJECT_CONFIG.shadows[direction];
    assert.ok(shadow.widthPercent >= 50 && shadow.widthPercent <= 300);
    assert.ok(shadow.heightPercent >= 50 && shadow.heightPercent <= 300);
  });
});

test("Options 套用會要求本機開發端寫回固定的專案設定檔", async () => {
  const [source, writer] = await Promise.all([
    readFile(new URL("../app/movement-lab.tsx", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../scripts/player-visual-config-vite-plugin.ts",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.match(source, /fetch\("\/api\/player-visual-config"/);
  assert.match(source, /PLAYER_VISUAL_PROJECT_CONFIG\.speed/);
  assert.match(source, /PLAYER_VISUAL_PROJECT_CONFIG\.size/);
  assert.doesNotMatch(
    source,
    /localStorage\.setItem\(\s*PLAYER_(?:DEFAULTS|SHADOW_TUNING)_STORAGE_KEY/,
  );
  assert.match(writer, /apply: "serve"/);
  assert.match(
    writer,
    /new URL\("\.\.\/app\/player-visual-config\.ts", import\.meta\.url\)/,
  );
});

test("遊戲 HUD 不再顯示移動面向動態字與底部操作提示", async () => {
  const [source, styles] = await Promise.all([
    readFile(new URL("../app/movement-lab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(source, /className="movement-status"/);
  assert.doesNotMatch(source, /className="controls-subtitle"/);
  assert.doesNotMatch(source, /INTERACTIVE" : moving \? "MOVING" : "FACING"/);
  assert.doesNotMatch(styles, /\.movement-status\s*\{/);
  assert.doesNotMatch(styles, /\.controls-subtitle(?:-[a-z]+)?\s*\{/);
});

test("左側測試場景資訊已移除，手把連線狀態獨立置於畫面正下方", async () => {
  const [source, styles] = await Promise.all([
    readFile(new URL("../app/movement-lab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(source, /className="top-left-hud"/);
  assert.doesNotMatch(source, />地圖測試場景</);
  assert.doesNotMatch(source, /NavMesh ready/);
  assert.match(source, /className=\{`gamepad-connection-status/);
  assert.match(source, /role="status"/);
  assert.match(styles, /\.gamepad-connection-status\s*\{[^}]*bottom: 18px;[^}]*left: 50%;[^}]*pointer-events: none;/s);
  assert.doesNotMatch(styles, /\.top-left-hud\s*\{/);
});
