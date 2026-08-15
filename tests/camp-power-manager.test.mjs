import assert from "node:assert/strict";
import test from "node:test";

import {
  CAMP_POWER_CAPACITY,
  CAMP_POWER_DAILY_CONSUMPTION,
  CAMP_POWER_DAILY_CONSUMPTION_QUEST_ID,
  CAMP_POWER_INITIAL_VALUE,
  CAMP_POWER_REFILL_AMOUNT,
  CAMP_POWER_REFILL_ITEM_ID,
  advanceCampPowerToGameMinutes,
  activateCampPowerDailyConsumptionAfterQuest,
  canRefillCampPower,
  createInitialCampPowerState,
  refillCampPower,
  setCampPowerDailyConsumptionEnabled,
} from "../app/camp-power-manager.ts";
import { readFileSync } from "node:fs";

test("營地電力初始為 3/50，任務尚未接入前不會自行消耗", () => {
  const initial = createInitialCampPowerState(360);
  assert.equal(initial.current, CAMP_POWER_INITIAL_VALUE);
  assert.equal(CAMP_POWER_INITIAL_VALUE, 3);
  assert.equal(CAMP_POWER_CAPACITY, 50);
  assert.equal(initial.dailyConsumptionEnabled, false);
  assert.equal(advanceCampPowerToGameMinutes(initial, 360 + 1440).current, 3);
});

test("啟用每日消耗後，每跨一個 06:00 週期扣除 1 點並封底於 0", () => {
  const enabled = setCampPowerDailyConsumptionEnabled(
    createInitialCampPowerState(360),
    true,
    360,
  );
  assert.equal(CAMP_POWER_DAILY_CONSUMPTION, 1);
  assert.equal(advanceCampPowerToGameMinutes(enabled, 360 + 1440).current, 2);
  assert.equal(advanceCampPowerToGameMinutes(enabled, 360 + 10 * 1440).current, 0);
});

test("任務 4 完成後才啟用耗電，啟用當下不追扣舊週期", () => {
  assert.equal(CAMP_POWER_DAILY_CONSUMPTION_QUEST_ID, "QUEST_CH03_MAIN_004");
  const initial = createInitialCampPowerState(360);
  const stillDisabled = activateCampPowerDailyConsumptionAfterQuest(
    initial,
    false,
    360 + 5 * 1440,
  );
  assert.equal(stillDisabled.current, 3);
  assert.equal(stillDisabled.dailyConsumptionEnabled, false);

  const activated = activateCampPowerDailyConsumptionAfterQuest(
    stillDisabled,
    true,
    360 + 5 * 1440,
  );
  assert.equal(activated.current, 3);
  assert.equal(activated.dailyConsumptionEnabled, true);
  assert.equal(
    advanceCampPowerToGameMinutes(activated, 360 + 6 * 1440).current,
    2,
  );
});

test("一個藍色晶體碎片補充 2 點，滿 50 後不可再灌入", () => {
  assert.equal(CAMP_POWER_REFILL_ITEM_ID, "R0001");
  assert.equal(CAMP_POWER_REFILL_AMOUNT, 2);
  const initial = createInitialCampPowerState(360);
  assert.equal(canRefillCampPower(initial, 1), true);
  assert.equal(refillCampPower(initial).current, 5);
  const almostFull = { ...initial, current: 49 };
  assert.equal(refillCampPower(almostFull).current, 50);
  const full = { ...initial, current: 50 };
  assert.equal(canRefillCampPower(full, 20), false);
  assert.equal(refillCampPower(full), full);
});

test("發電共振器在指定任務階段解鎖後可重複投入單顆 R0001", () => {
  const scene = JSON.parse(
    readFileSync(new URL("../public/maps/map_test01.scene.json", import.meta.url), "utf8"),
  );
  const resonator = scene.interactables.find(
    (interactable) => interactable.id === "interaction-013",
  );
  assert.ok(resonator);
  assert.equal(resonator.interactionLimitMode, undefined);
  assert.deepEqual(
    resonator.useRequirements.map(({ kind, itemId, quantity }) => ({
      kind,
      itemId,
      quantity,
    })),
    [
      { kind: "questStage", itemId: "", quantity: 1 },
      { kind: "item", itemId: "R0001", quantity: 1 },
    ],
  );
  assert.notEqual(resonator.interactionLimitMode, "once");
});

test("遊戲場景包含 10 x 5 的營地電力格與灌入確認視窗", () => {
  const source = readFileSync(
    new URL("../app/movement-lab.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /const columns = 10;/);
  assert.match(source, /const rows = 5;/);
  assert.match(source, /const powerUiScale = 1\.2;/);
  assert.match(source, /index < CAMP_POWER_CAPACITY/);
  assert.match(source, /activePromptTargetId === interactable\.id/);
  assert.doesNotMatch(source, /isPowerInspectionObjectiveActive/);
  assert.match(source, /camp-power-confirmation-overlay/);
  assert.match(source, /灌入藍色晶體碎片？/);
});
