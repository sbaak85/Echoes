"use client";

import { useEffect, useRef, useState } from "react";
import { StarshipInteractionMenu, type StarshipInteractionMenuController, type StarshipInteractionControlMode } from "../starship-interaction-menu";
import { AudioEventManager } from "../audio-event-manager";
import { craftInventoryRecipe } from "../crafting-recipes";
import { cursorOwnership, GamepadHandoffGate } from "../cursor-ownership";
import { CursorPresentationGuard } from "../cursor-presentation";
import { GamepadButtonIcon } from "../gamepad-button-icon";
import { resolveRuntimePublicAssetUrl as assetUrl } from "../public-asset-url";
import type { PlayerInventory } from "../item-database";
import "./preview.css";

const previewInventory = (): PlayerInventory => ({
  R0001: 2, R0002: 2, R0003: 2, T0001: 1, T0002: 1, R0007: 1,
  R0008: 1, R0009: 1, R0010: 1, R0011: 1, T0010: 1, R0018: 1,
  R0019: 1, R0020: 3, R0021: 1, R0022: 1, R0036: 2,
});

// The Interaction is temporary; every menu, spotlight, Tip and transaction uses
// the production component. Inventory/completion live only in this page's state.
export default function StarshipCraftingPreview() {
  const [open, setOpen] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [inventory, setInventory] = useState(previewInventory);
  const [inputMode, setInputMode] = useState<"keyboard-mouse" | "gamepad" | "mobile">("keyboard-mouse");
  const [owner, setOwner] = useState(cursorOwnership.owner);
  const controller = useRef<StarshipInteractionMenuController>(null);
  const entry = useRef<HTMLButtonElement>(null);
  const audio = useRef<AudioEventManager | null>(null);
  const inventoryRef = useRef(inventory); inventoryRef.current = inventory;
  const openRef = useRef(false);
  const handoff = useRef(new GamepadHandoffGate());
  const launchRef = useRef<() => void>(() => {});
  const sound = () => { void audio.current?.play("uiInput", { restart: true }).catch(() => {}); };
  const launch = () => {
    if (openRef.current) return;
    sound(); setInventory(previewInventory()); setCompleted(false);
    openRef.current = true; handoff.current.requireNeutral(); setOpen(true);
  };
  launchRef.current = launch;
  const close = () => { openRef.current = false; handoff.current.requireNeutral(); setOpen(false); };
  const controlMode = (mode: StarshipInteractionControlMode) => {
    cursorOwnership.take(mode === "directional" ? "directional" : mode === "touch" ? "touch" : mode === "cursor" ? "gamepad" : "mouse");
  };

  useEffect(() => {
    audio.current = new AudioEventManager();
    const guard = new CursorPresentationGuard(document);
    const unsubscribe = cursorOwnership.subscribe(next => setOwner(next));
    let frame = 0, previousDirection = "", repeatAt = 0;
    let previousButtons = Array<boolean>(8).fill(true);
    let connectedIndex: number | null = null;
    const pause = () => {
      handoff.current.requireNeutral(); previousDirection = "";
      previousButtons.fill(true); audio.current?.playWorkbenchHover(null);
    };
    const pointer = (event: PointerEvent) => {
      if (event.pointerType === "touch") { cursorOwnership.take("touch"); setInputMode("mobile"); return; }
      if (event.pointerType !== "mouse") return;
      if (cursorOwnership.recordMouse(event.clientX, event.clientY, event.type === "pointerdown")) {
        setInputMode("keyboard-mouse"); controller.current?.setControlMode("pointer");
      }
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      setInputMode("keyboard-mouse"); cursorOwnership.take("directional");
      if (openRef.current) return; // The production menu owns its own keyboard input.
      if (["Enter", " ", "e", "E"].includes(event.key)) {
        event.preventDefault(); if (!event.repeat) launchRef.current();
      } else if (event.key.startsWith("Arrow") || event.key === "Tab") {
        event.preventDefault(); entry.current?.focus({ preventScroll: true });
      }
    };
    const poll = (now: number) => {
      const pad = Array.from(navigator.getGamepads?.() ?? []).find(candidate => candidate?.connected);
      if (document.hidden || !document.hasFocus()) { pause(); }
      else if (pad) {
        if (connectedIndex !== pad.index) { connectedIndex = pad.index; pause(); }
        const raw = {
          x: (Number(!!pad.buttons[15]?.pressed) - Number(!!pad.buttons[14]?.pressed)) || (pad.axes[0] ?? 0),
          y: (Number(!!pad.buttons[13]?.pressed) - Number(!!pad.buttons[12]?.pressed)) || (pad.axes[1] ?? 0),
          aPressed: !!pad.buttons[0]?.pressed, bPressed: !!pad.buttons[1]?.pressed,
          xPressed: !!pad.buttons[2]?.pressed, yPressed: !!pad.buttons[3]?.pressed,
          lbPressed: !!pad.buttons[4]?.pressed, rbPressed: !!pad.buttons[5]?.pressed,
          ltPressed: !!pad.buttons[6]?.pressed || (pad.buttons[6]?.value ?? 0) >= .5,
          rtPressed: !!pad.buttons[7]?.pressed || (pad.buttons[7]?.value ?? 0) >= .5,
        };
        const input = handoff.current.filter(raw);
        const pressed = [input.aPressed, input.bPressed, input.xPressed, input.yPressed, input.lbPressed, input.rbPressed, input.ltPressed, input.rtPressed];
        const edge = (index: number) => pressed[index] && !previousButtons[index];
        const direction = Math.abs(input.x) >= Math.abs(input.y) && Math.abs(input.x) >= .65 ? input.x < 0 ? "left" : "right"
          : Math.abs(input.y) >= .65 ? input.y < 0 ? "up" : "down" : "";
        const move = direction && (direction !== previousDirection || now >= repeatAt);
        if (move || pressed.some((_, index) => edge(index))) {
          setInputMode("gamepad"); cursorOwnership.take("directional");
          controller.current?.setControlMode("directional");
        }
        if (openRef.current) {
          controller.current?.updateTriggers?.(input.ltPressed, input.rtPressed, now);
          if (move) controller.current?.move(direction as "left" | "right" | "up" | "down");
          // One action per frame. Opening/closing always requires a new release.
          if (edge(0)) controller.current?.activate();
          else if (edge(1)) controller.current?.back();
          else if (edge(2)) controller.current?.secondary?.();
          else if (edge(3)) controller.current?.inspect?.();
          else if (edge(4)) controller.current?.switchColumn?.(-1);
          else if (edge(5)) controller.current?.switchColumn?.(1);
        } else {
          if (move) entry.current?.focus({ preventScroll: true });
          if (edge(0)) launchRef.current();
        }
        if (move) repeatAt = now + (direction === previousDirection ? 170 : 380);
        previousDirection = direction; previousButtons = pressed;
      } else if (connectedIndex !== null) { connectedIndex = null; pause(); cursorOwnership.take("mouse"); setInputMode("keyboard-mouse"); controller.current?.setControlMode("pointer"); }
      guard.reconcile(cursorOwnership.owner, cursorOwnership.lastMouse);
      frame = requestAnimationFrame(poll);
    };
    window.addEventListener("pointermove", pointer, { capture: true });
    window.addEventListener("pointerdown", pointer, { capture: true });
    window.addEventListener("keydown", keyboard, { capture: true });
    window.addEventListener("blur", pause);
    frame = requestAnimationFrame(poll);
    return () => {
      cancelAnimationFrame(frame); unsubscribe(); guard.dispose();
      window.removeEventListener("pointermove", pointer, { capture: true });
      window.removeEventListener("pointerdown", pointer, { capture: true });
      window.removeEventListener("keydown", keyboard, { capture: true }); window.removeEventListener("blur", pause);
      audio.current?.dispose(); audio.current = null;
    };
  }, []);

  return <main className="game-shell ship-tutorial-preview" data-owner={owner}
    style={{ backgroundImage: `linear-gradient(#031017ad,#031017e8),url("${assetUrl("ui/interactions/menu-b/craft-scene.jpg")}")` }}>
    {!open && <section className="ship-tutorial-preview-entry">
      <span className="ship-tutorial-preview-kicker">INTERACTION · PREVIEW</span>
      <h1>伊薩卡號 · 工作甲板</h1>
      <p>從飛船互動入口開始，操作製作系統教學。</p>
      <button ref={entry} className="ship-tutorial-preview-interaction" onClick={launch}>
        {inputMode === "gamepad" && <GamepadButtonIcon button="A" />}
        {completed ? "重新開始教學" : "互動：進入飛船"}
      </button>
      <small>{inputMode === "gamepad" ? "左搖桿／方向鍵選擇 · A 互動" : inputMode === "mobile" ? "輕觸開始" : "點擊互動 · E／Enter 開始"}</small>
      {completed && <p role="status">教學已完成。本次製作螢光棒 ×{inventory.T0006 ?? 0}。</p>}
      <p className="ship-tutorial-preview-note">獨立預覽 · 不更動玩家存檔與任務</p>
    </section>}
    {open && <StarshipInteractionMenu ref={controller} tutorialStart inputMode={inputMode} inventory={inventory}
      onInputModeChange={setInputMode} onControlModeChange={controlMode} onInput={sound}
      onSleep={close} onClose={close} onTutorialCompleted={() => setCompleted(true)}
      onWorkbenchHoverAudio={event => audio.current?.playWorkbenchHover(event)}
      onWorkbenchOpenAudio={event => { void audio.current?.play(event).catch(() => {}); }}
      onCraftAudio={event => { void audio.current?.play(event).catch(() => {}); }}
      onCraft={(id, quantity = 1) => {
        const result = craftInventoryRecipe(inventoryRef.current, id, quantity);
        if (result.ok) { inventoryRef.current = result.inventory; setInventory(result.inventory); }
        return result;
      }} />}
  </main>;
}
