import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import * as availability from "../app/starship-menu-availability.ts";
import * as tutorial from "../app/starship-crafting-tutorial.ts";
import { QuestRuntimeManager } from "../app/quest-runtime-manager.ts";
import { normalizeEchoesSaveData, SAVE_DATA_FORMAT } from "../app/save-data.ts";

const source = readFileSync(new URL("../app/starship-interaction-menu.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/starship-interaction-menu.css", import.meta.url), "utf8");
const locked = { cooking: true, repair: true };
const unlocked = { cooking: false, repair: false };

function loadMenu(react) {
  const code = ts.transpileModule(source, { compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const dependencies = {
    react, "react/jsx-runtime": jsxRuntime,
    "./gamepad-button-icon": { GamepadButtonIcon: () => null },
    "./crafting-workbench": { CraftingWorkbench: () => null },
    "./starship-crafting-tutorial": tutorial,
    "./starship-crafting-tutorial-overlay": { StarshipCraftingTutorialOverlay: () => null },
    "./starship-menu-availability": availability, "./starship-interaction-menu.css": {},
    "./public-asset-url": { resolveRuntimePublicAssetUrl: value => `/${value}` },
  };
  const module = { exports: {} };
  new Function("require", "module", "exports", code)(id => {
    assert.ok(id in dependencies, `Unexpected import ${id}`); return dependencies[id];
  }, module, module.exports);
  return module.exports.StarshipInteractionMenu;
}

test("cooking and repair remain locked before and after tutorial completion and stage progression, including restored saves", () => {
  const data = JSON.parse(readFileSync(new URL("../public/quests/quest-data.json", import.meta.url), "utf8"));
  const base = new QuestRuntimeManager(data).exportSave();
  for (const stage of [availability.STARSHIP_MENU_RESTRICTED_STAGE, "QUEST_CH04_MAIN_001_STAGE_02", "QUEST_CH04_MAIN_001_STAGE_04"]) {
    for (const completed of [false, true]) {
      const save = structuredClone(base), entry = save.quests[tutorial.STARSHIP_CRAFTING_TUTORIAL_QUEST];
      entry.state = "active"; entry.currentStageId = stage;
      const portable = normalizeEchoesSaveData(JSON.parse(JSON.stringify({
        format: SAVE_DATA_FORMAT, schemaVersion: 1, summary: {},
        progress: { sceneId: "Scene_3", quest: save, story: { storyFlags: { [tutorial.STARSHIP_CRAFTING_TUTORIAL_COMPLETED_FLAG]: completed } } },
      })));
      const manager = new QuestRuntimeManager(data, {}, portable.progress.quest);
      assert.deepEqual(availability.getStarshipMenuFeatureLocks(manager, portable.progress.story.storyFlags),
        locked);
    }
  }
  assert.deepEqual(availability.getStarshipMenuFeatureLocks(null, { [tutorial.STARSHIP_CRAFTING_TUTORIAL_COMPLETED_FLAG]: true }), locked);
  assert.deepEqual(availability.getStarshipMenuFeatureLocks({ getCurrentStage: () => availability.STARSHIP_MENU_RESTRICTED_STAGE },
    { "tutorial:starship-crafting:completed:v1": true }), locked);
});

test("real menu renders a sharp grey repair card with aria-disabled and removes it from tab order", () => {
  const Menu = loadMenu(React);
  const html = renderToStaticMarkup(React.createElement(Menu, {
    inputMode: "gamepad", featureLocks: locked, inventory: {},
    onInputModeChange() {}, onControlModeChange() {}, onInput() {}, onSleep() {}, onClose() {}, onCraft() {},
  }));
  const repair = html.match(/<button[^>]*data-tutorial-action="repair"[^>]*>/)?.[0];
  assert.ok(repair); assert.match(repair, /data-feature-locked="true"/);
  assert.match(repair, /aria-disabled="true"/); assert.match(repair, /tabindex="-1"/);
  assert.match(repair, /is-feature-locked/); assert.doesNotMatch(repair, / disabled|is-selected/);
  const rule = css.match(/\.starship-interaction-menu \.im-row\.is-feature-locked \{([^}]+)\}/)?.[1];
  assert.match(rule, /filter: grayscale\(1\)/); assert.match(rule, /opacity: \.75/);
  assert.doesNotMatch(rule, /blur\(/);
  assert.match(css, /\.im-row\.is-feature-locked \.im-option-media::after\s*\{\s*filter: none/);
});

function createRig(t) {
  const states = [], refs = []; let stateIndex = 0, refIndex = 0, tree, buttons = [];
  const previousDocument = globalThis.document;
  const previousHTMLElement = globalThis.HTMLElement;
  globalThis.document = { activeElement: null };
  globalThis.HTMLElement = class {};
  t.after(() => {
    if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
    if (previousHTMLElement === undefined) delete globalThis.HTMLElement; else globalThis.HTMLElement = previousHTMLElement;
  });
  const hooks = { ...React,
    useState(initial) { const i = stateIndex++; if (!(i in states)) states[i] = typeof initial === "function" ? initial() : initial;
      return [states[i], value => { states[i] = typeof value === "function" ? value(states[i]) : value; }]; },
    useRef(initial) { return refs[refIndex++] ??= { current: initial }; },
    useCallback: value => value, useEffect() {},
    useImperativeHandle(ref, create) { ref.current = create(); },
  };
  const Menu = loadMenu(hooks), control = { current: null }, sounds = [];
  const props = { inputMode: "gamepad", featureLocks: locked, inventory: {},
    onInputModeChange() {}, onControlModeChange() {}, onInput() { sounds.push("input"); },
    onSleep() {}, onClose() {}, onCraft() {},
  };
  const nodes = value => {
    if (Array.isArray(value)) return value.flatMap(nodes);
    if (!value || typeof value !== "object" || !value.props) return [];
    return [value, ...nodes(value.props.children)];
  };
  const render = () => {
    stateIndex = refIndex = 0; tree = Menu.render(props, control);
    buttons = nodes(tree).filter(node => node.type === "button").map(node => ({
      props: node.props, disabled: false,
      dataset: { starshipMenuIndex: String(node.props["data-starship-menu-index"]), tutorialAction: node.props["data-tutorial-action"] },
      click() { node.props.onClick?.({ currentTarget: this }); },
      focus() { document.activeElement = this; node.props.onFocus?.({ currentTarget: this }); },
      blur() { if (document.activeElement === this) document.activeElement = null; },
      closest() { return this; },
      getBoundingClientRect() { return { left: 0, top: Number(this.dataset.starshipMenuIndex) * 100, width: 200, height: 80 }; },
    }));
    for (const node of nodes(tree)) if (node.props.ref && typeof node.props.ref === "object") {
      node.props.ref.current = { querySelectorAll: () => buttons, contains: element => buttons.includes(element) };
    }
    return tree;
  };
  render();
  return { props, control, sounds, render, button: action => buttons.find(button => button.dataset.tutorialAction === action),
    selected: () => buttons.find(button => button.props.className.includes("is-selected"))?.dataset.starshipMenuIndex,
    get tree() { return tree; } };
}

test("real controller and row click cannot activate locked repair or cooking, but tool crafting remains available", t => {
  const rig = createRig(t);
  rig.button("repair").click(); rig.render();
  assert.ok(rig.button("craft")); assert.equal(rig.sounds.length, 0);
  assert.equal(rig.control.current.activatePointerTarget(rig.button("repair")), false);
  rig.button("craft").click(); rig.render();
  assert.ok(rig.button("cooking").props["data-feature-locked"]);
  rig.sounds.length = 0;
  rig.button("cooking").click(); rig.render();
  assert.ok(rig.button("workbench")); assert.equal(rig.sounds.length, 0);
  assert.equal(rig.control.current.activatePointerTarget(rig.button("cooking")), false);
  rig.button("workbench").click();
  const tree = rig.render();
  assert.equal(tree.props.children[0].props.mode, "craft");
});

test("directional navigation skips locked cards and cursor confirmation on a locked card does nothing", t => {
  const rig = createRig(t);
  rig.control.current.move("down"); rig.render(); assert.equal(rig.selected(), "1");
  rig.control.current.move("down"); rig.render(); assert.equal(rig.selected(), "3");
  rig.control.current.move("down"); rig.render(); assert.equal(rig.selected(), "0");
  rig.control.current.setControlMode("cursor"); rig.render();
  rig.control.current.hover(2); rig.render();
  rig.control.current.activate(); rig.render(); assert.ok(rig.button("craft"));
  rig.button("craft").click(); rig.render();
  rig.control.current.move("down"); rig.render(); assert.equal(rig.selected(), "2", "return button keeps its physical index");
  rig.control.current.move("down"); rig.render(); assert.equal(rig.selected(), "0");
  // Force cursor mode directly in the hook host, where native focus effects are omitted.
  rig.props.inputMode = "gamepad";
  const oldElement = document.activeElement; document.activeElement = null;
  const previousHTMLElement = globalThis.HTMLElement; globalThis.HTMLElement = class {};
  try { rig.control.current.setControlMode("cursor"); rig.render(); }
  finally { if (previousHTMLElement === undefined) delete globalThis.HTMLElement; else globalThis.HTMLElement = previousHTMLElement; }
  rig.control.current.hover(1); rig.render(); rig.control.current.activate(); rig.render();
  assert.ok(rig.button("workbench")); document.activeElement = oldElement;
});

test("lock changes use current props rather than stale callbacks and only an explicit feature policy change restores card activation", t => {
  const rig = createRig(t);
  rig.props.featureLocks = unlocked; rig.render();
  const repair = rig.button("repair"); assert.equal(repair.props["aria-disabled"], undefined);
  rig.props.featureLocks = locked; rig.render(); repair.click(); rig.render();
  assert.ok(rig.button("craft"), "an old click closure cannot bypass newly applied locks");
  rig.props.featureLocks = unlocked; rig.render(); rig.button("repair").click();
  assert.equal(rig.render().props.children[0].props.children[1].props.className, "im-panel im-view-repair");
});

test("production uses the current quest snapshot and persistent completion flag, not menu entry ID or OBJ20", () => {
  const movement = readFileSync(new URL("../app/movement-lab.tsx", import.meta.url), "utf8");
  assert.match(movement, /featureLocks=\{getStarshipMenuFeatureLocks\(questRuntimeManagerRef.current, storyProgressRef.current.storyFlags\)\}/);
  assert.doesNotMatch(readFileSync(new URL("../app/starship-menu-availability.ts", import.meta.url), "utf8"), /OBJ_20|interaction-029|interaction-031/);
});

test("omitting featureLocks keeps repair and cooking locked in the shared menu", t => {
  const rig = createRig(t);
  delete rig.props.featureLocks;
  rig.render();
  assert.equal(rig.button("repair").props["aria-disabled"], true);
  rig.button("repair").click(); rig.render();
  assert.ok(rig.button("craft"));
  rig.button("craft").click(); rig.render();
  assert.equal(rig.button("cooking").props["aria-disabled"], true);
  rig.button("cooking").click(); rig.render();
  assert.ok(rig.button("workbench"));
});
