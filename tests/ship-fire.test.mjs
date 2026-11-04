import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  isShipFireActive,
  SHIP_FIRE_EMITTERS,
  SHIP_FIRE_SETTINGS,
  SHIP_FIRE_START_DIALOGUE,
} from "../app/ship-fire.ts";
import { CHAPTER02_CIRCUIT_DIALOGUE } from "../app/chapter02-circuit-failure.ts";

test("船艙火焰在第二章 section-16 播完後才開始，之後維持", () => {
  assert.equal(SHIP_FIRE_START_DIALOGUE, CHAPTER02_CIRCUIT_DIALOGUE);
  const done = (id) => id === CHAPTER02_CIRCUIT_DIALOGUE;
  const notYet = () => false;
  assert.equal(isShipFireActive("ship_interior", 2, notYet), false);
  assert.equal(isShipFireActive("ship_interior", 2, done), true);
  assert.equal(isShipFireActive("ship_interior", 3, done), false);
  assert.equal(isShipFireActive("map_test01", 2, done), false);
});

test("船艙火焰沿用預覽頁記住的參數與火源配置", () => {
  assert.deepEqual({ ...SHIP_FIRE_SETTINGS }, {
    fireSize: 1, fireRate: 45, fireHeight: 1, fireSway: 1, glow: 1, smoke: 0.45,
    sparkInterval: 2.5, sparkCount: 26, sparkSpeed: 1, gravity: 1, sparkTrail: 1, embers: 0.6,
  });
  assert.equal(SHIP_FIRE_EMITTERS.filter((e) => e.type === "fire").length, 10);
  assert.equal(SHIP_FIRE_EMITTERS.filter((e) => e.type === "spark").length, 12);
});

test("火焰畫在紅色警戒光照之後（不被光照壓暗）", () => {
  const source = readFileSync(new URL("../app/movement-lab.tsx", import.meta.url), "utf8");
  assert.match(source, /drawRedAlertLighting\(time\);\s*drawShipFire\(time\);/);
});
