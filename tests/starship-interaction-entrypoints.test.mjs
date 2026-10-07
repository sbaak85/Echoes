import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { evaluateInteractionStageRequirement } from "../app/interaction-flow.ts";

const root = new URL("../", import.meta.url);
const source = await readFile(new URL("app/movement-lab.tsx", root), "utf8");
const scene = JSON.parse(await readFile(new URL("public/maps/map_test01.scene.json", root), "utf8"));
const declaration = source.match(/const STARSHIP_INTERACTION_MENU_INTERACTION_IDS = new Set\([\s\S]*?\);/)?.[0];
const completion = source.match(/const completeTriggeredInteraction = \(\) => completeInteraction\([\s\S]*?\n      \);/)?.[0];
assert.ok(declaration, "the entrypoint registry must exist");
assert.ok(completion, "entrypoints must use the real interaction completion callback");
// Execute the actual dispatch expressions, without mounting the world or altering saves.
const dispatch = new Function("interactable", "source", "completeInteraction", "openStarshipInteractionMenu",
  `${declaration}\n${completion}\nreturn completeTriggeredInteraction();`);

for (const id of ["scene3-interaction-029", "scene3-interaction-031"]) {
  test(`${id} opens the shared menu only after interaction completion`, () => {
    assert.ok(scene.interactables.some(interaction => interaction.id === id));
    for (const input of ["pointer", "keyboard", "gamepad", "touch"]) {
      const interactable = { id };
      let callback, openings = 0;
      const result = dispatch(interactable, input, (actual, source, onComplete) => {
        assert.equal(actual, interactable);
        assert.equal(source, input);
        callback = onComplete;
        return true;
      }, entryId => { assert.equal(entryId, id); openings += 1; });
      assert.equal(result, true);
      assert.equal(openings, 0, "do not open before the existing completion flow settles");
      assert.equal(typeof callback, "function");
      callback();
      assert.equal(openings, 1);
    }
  });
}

test("unrelated interactions never receive the ship menu callback", () => {
  for (const id of ["scene3-interaction-030", "scene6-interaction-020", "scene6-interaction-031"]) {
    let callback;
    dispatch({ id }, "pointer", (_actual, _source, onComplete) => { callback = onComplete; },
      () => assert.fail("unrelated interaction opened the ship menu"));
    assert.equal(callback, undefined);
  }
});

test("031 keeps its independent OBJ20 completion gate; routing does not unlock it", () => {
  const interaction = scene.interactables.find(entry => entry.id === "scene3-interaction-031");
  const requirement = interaction.useRequirements.find(entry => entry.kind === "questStage");
  assert.equal(requirement.scope, "both");
  assert.equal(requirement.objectiveId, "QUEST_CH04_MAIN_001_OBJ_20");
  assert.equal(requirement.objectiveState, "completed");
  for (const reachedStage of [false, true]) for (const completed of [false, true]) {
    assert.equal(evaluateInteractionStageRequirement(requirement, () => reachedStage, () => reachedStage,
      (questId, objectiveId, state) => {
        assert.equal(questId, "QUEST_CH04_MAIN_001");
        assert.equal(objectiveId, "QUEST_CH04_MAIN_001_OBJ_20");
        assert.equal(state, "completed");
        return completed;
      }), reachedStage && completed);
  }
  const trigger = source.slice(source.indexOf("    const triggerInteraction = ("), source.indexOf("      const completeTriggeredInteraction = ()"));
  assert.match(trigger, /if \(!isInteractableConditionActive\(interactable\)\) return false;/);
  assert.match(trigger, /if \(getInteractionUseRequirementFailure\(interactable\)\)/);
});
