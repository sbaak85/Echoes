"use client";
import { useEffect, useRef, useState } from "react";
import { PhototropicPuzzleOverlay, type PlantUiController } from "../phototropic-puzzle-ui";
import { initialPhototropicState, PLANT_SUCCESS_MESSAGE, type PlantSide, type PhototropicState } from "../phototropic-puzzle";
import { resolveRuntimePublicAssetUrl } from "../public-asset-url";
import { cursorOwnership } from "../cursor-ownership";

// Uses the production component, but never touches the player's stored puzzle, inventory or quests.
export default function PhototropicPreview() {
  const [state, setState] = useState(initialPhototropicState);
  const [side, setSide] = useState<PlantSide | null>(null);
  const [dialogue, setDialogue] = useState(0);
  const [success, setSuccess] = useState(false);
  const controller = useRef<PlantUiController | null>(null);
  const buttons = useRef<HTMLDivElement>(null);
  const dialogueButtons = useRef<HTMLElement>(null);
  const [menuSelection, setMenuSelection] = useState(0);
  const [owner, setOwner] = useState(cursorOwnership.owner);
  const imagePath = resolveRuntimePublicAssetUrl("ui/interaction-illustrations/趨光植物背景.png");
  useEffect(() => {
    let selected = 0;
    const choices = () => [...((dialogueButtons.current ?? buttons.current)?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
    const menuMove = (dir: number) => { const items = choices(); if (!items.length) return; cursorOwnership.take("directional"); selected = (selected + dir + items.length) % items.length; setMenuSelection(selected); items[selected]?.focus(); };
    const key = (e: KeyboardEvent) => {
      if (controller.current) { e.preventDefault(); controller.current.key(e.key.toLowerCase(), e.repeat); }
      else if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Tab"].includes(e.key)) { e.preventDefault(); menuMove(e.key === "ArrowLeft" || e.key === "ArrowUp" || e.shiftKey ? -1 : 1); }
      else if (!e.repeat && ["Enter", " "].includes(e.key)) { e.preventDefault(); cursorOwnership.take("directional"); choices()[selected]?.click(); }
    };
    const unsubscribe = cursorOwnership.subscribe(setOwner);
    window.addEventListener("keydown", key);
    let raf = 0, previous = performance.now(), a = true, b = true, menuDir = 0;
    const frame = (now: number) => {
      const pad = [...navigator.getGamepads()].find(Boolean), dt = Math.min(.05, (now - previous) / 1000); previous = now;
      if (pad) {
        const confirm = pad.buttons[0]?.pressed, back = pad.buttons[1]?.pressed;
        const x = (pad.buttons[15]?.pressed ? 1 : pad.buttons[14]?.pressed ? -1 : pad.axes[0]) || 0;
        const y = (pad.buttons[13]?.pressed ? 1 : pad.buttons[12]?.pressed ? -1 : pad.axes[1]) || 0;
        if (controller.current) controller.current.pad(x, y, confirm && !a, back && !b, dt);
        else {
          const dir = Math.abs(x) > .55 ? Math.sign(x) : Math.abs(y) > .55 ? Math.sign(y) : 0;
          if (dir && dir !== menuDir) menuMove(dir);
          if (confirm && !a) { cursorOwnership.take("directional"); choices()[selected]?.click(); }
          menuDir = dir;
        }
        a = confirm; b = back;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { unsubscribe(); cancelAnimationFrame(raf); window.removeEventListener("keydown", key); };
  }, []);
  const finish = (next: PhototropicState, solved: boolean) => {
    setState({ ...next, solved: next.solved || solved }); setSide(null); setSuccess(solved);
  };
  return <main className="game-shell" style={{ position: "relative", height: "100svh", width: "100%", minHeight: 600, background: "#041719", color: "#d5e7d6", overflow: "hidden" }}>
    <div className="plant-preview-choices" data-owner={owner} ref={buttons} style={{ padding: 30 }} onPointerDown={e => cursorOwnership.take(e.pointerType === "touch" ? "touch" : "mouse")}><h1>趨光植物 · 正式元件流程預覽</h1><p>此預覽不更動玩家存檔或任務。左右初始為空槽；兩側設定會保留。</p>
      <button disabled={side !== null} data-selected={menuSelection === 0 || undefined} onClick={() => { setDialogue(1); setSide("L"); setSuccess(false); }}>互動 020 · 左側</button>{" "}
      <button disabled={side !== null} data-selected={menuSelection === 1 || undefined} onClick={() => { setDialogue(1); setSide("R"); setSuccess(false); }}>互動 021 · 右側</button>{" "}
      <button disabled={side !== null} data-selected={menuSelection === 2 || undefined} onClick={() => { setState(initialPhototropicState()); setSuccess(false); }}>重置預覽</button>
      <p>左側：{state.L.slot === null ? "未放置" : `L${state.L.slot + 1} · ${state.L.angle}°`}　右側：{state.R.slot === null ? "未放置" : `R${state.R.slot + 1} · ${state.R.angle}°`}</p>
      {success && <p role="status">{PLANT_SUCCESS_MESSAGE}</p>}
    </div>
    {side && dialogue > 0 && <div className="plant-puzzle-overlay"><img className="plant-puzzle-background" src={imagePath} alt="趨光植物背景" /><section className="plant-panel" ref={dialogueButtons}>
      <h2>Sbaak</h2><p>{dialogue === 1 ? "現在來驗證這個趨光性理論看看。" : "先決定螢光棒的位置，再調整照射藤蔓的角度。"}</p><button className="plant-confirm" data-selected={owner === "directional" || undefined} onClick={() => setDialogue(dialogue === 1 ? 2 : 0)}>繼續對話</button>
    </section></div>}
    {side && dialogue === 0 && <PhototropicPuzzleOverlay key={side} ref={controller} view={{ side, imagePath, initial: state }} onIntroduced={() => setState(previous => ({ ...previous, introduced: true }))} onFinish={finish} />}
  </main>;
}
