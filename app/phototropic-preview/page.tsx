"use client";
import { useEffect, useRef, useState } from "react";
import { PhototropicPuzzleOverlay, type PlantUiController } from "../phototropic-puzzle-ui";
import { initialPhototropicState, PLANT_SUCCESS_MESSAGE, type PlantSide, type PhototropicState } from "../phototropic-puzzle";
import { resolveRuntimePublicAssetUrl } from "../public-asset-url";
import { cursorOwnership } from "../cursor-ownership";
import { DialogueManager } from "../dialogue-manager";
import { createDialoguePlayer, type DialogueContext, type DialoguePlayback, type DialogueTyping, type DialogueView } from "../dialogue-player";
import { DialoguePlayerView } from "../dialogue-player-view";
import { getDialogueHistoryRightStickScrollDelta, hasDialogueHistoryScrollbar, type DialogueHistoryView } from "../dialogue-history";
import { AudioEventManager } from "../audio-event-manager";
import { InteractionIllustrationOverlay } from "../interaction-illustration";
import { STORY_DIALOGUES } from "../story-content";
import scene6 from "../../public/maps/map_scene_06B.scene.json";

// Uses the production players and scene scripts, without changing player saves,
// inventory, story progress or quests. Only this page's puzzle state is retained.
export default function PhototropicPreview() {
  const [state, setState] = useState(initialPhototropicState);
  const [side, setSide] = useState<PlantSide | null>(null);
  const [introduction, setIntroduction] = useState(false);
  const [success, setSuccess] = useState(false);
  const controller = useRef<PlantUiController | null>(null);
  const buttons = useRef<HTMLDivElement>(null);
  const [menuSelection, setMenuSelection] = useState(0);
  const [owner, setOwner] = useState(cursorOwnership.owner);
  const [gamepadMode, setGamepadMode] = useState(false);
  const [dialogueView, setDialogueView] = useState<DialogueView>(null);
  const [history, setHistory] = useState<DialogueHistoryView | null>(null);
  const [historyScrollable, setHistoryScrollable] = useState(false);
  const [textSize, setTextSize] = useState<"small" | "large">("small");
  const playback = useRef<DialoguePlayback | null>(null), typing = useRef<DialogueTyping | null>(null), historyOpen = useRef(false);
  const dialogueBox = useRef<HTMLButtonElement>(null), historyScroll = useRef<HTMLDivElement>(null), historyClose = useRef<HTMLButtonElement>(null);
  const audio = useRef<AudioEventManager | null>(null);
  const dialogueManager = useRef(new DialogueManager<DialogueContext>()).current;
  const player = createDialoguePlayer({
    playback, typing, historyOpen, setView: setDialogueView, setHistory,
    setTimer: (callback, delay) => window.setTimeout(callback, delay), clearTimer: timer => window.clearTimeout(timer),
    onTypingStart: restart => { if (!document.hidden) void audio.current?.play("dialogueTyping", { restart }).catch(() => {}); },
    onTypingStop: () => audio.current?.stop("dialogueTyping"),
    onLineSe: lineId => audio.current?.triggerDialogueLineSe(lineId),
    onStart: () => { void audio.current?.play("dialogueOpened").catch(() => {}); },
    onClose: () => audio.current?.clearDialogueLineSe(),
    onHistoryOpen: () => { void audio.current?.play("uiInput").catch(() => {}); requestAnimationFrame(() => { if (historyScroll.current) historyScroll.current.scrollTop = historyScroll.current.scrollHeight; historyClose.current?.focus({ preventScroll: true }); }); },
    onHistoryClose: () => { void audio.current?.play("uiInput").catch(() => {}); requestAnimationFrame(() => dialogueBox.current?.focus({ preventScroll: true })); },
  });
  const playerRef = useRef(player); playerRef.current = player;
  const imagePath = resolveRuntimePublicAssetUrl("ui/interaction-illustrations/趨光植物背景.png");
  useEffect(() => {
    audio.current = new AudioEventManager();
    setTextSize(window.matchMedia("(max-width: 680px), (pointer: coarse)").matches ? "large" : "small");
    Object.entries(STORY_DIALOGUES).forEach(([id, script]) => dialogueManager.register(id, script));
    for (const id of ["scene6-interaction-020", "scene6-interaction-021"]) {
      const script = scene6.interactables.find(interaction => interaction.id === id)?.dialogue;
      if (script) dialogueManager.register(id, script);
    }
    dialogueManager.setPresenter((request, complete) => { playerRef.current.present(request.id, request.context, complete, request.script); return () => playerRef.current.close(); });
    return () => { dialogueManager.clearQueue(); dialogueManager.cancelCurrent(); playerRef.current.close(); audio.current?.dispose(); audio.current = null; };
  }, [dialogueManager]);
  useEffect(() => {
    if (!history) { setHistoryScrollable(false); return; }
    const list = historyScroll.current; if (!list) return;
    const update = () => setHistoryScrollable(hasDialogueHistoryScrollbar(list.scrollHeight, list.clientHeight));
    update(); const observer = new ResizeObserver(update); observer.observe(list); Array.from(list.children).forEach(child => observer.observe(child));
    return () => observer.disconnect();
  }, [history]);
  useEffect(() => {
    let selected = 0;
    const choices = () => [...(buttons.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
    const menuMove = (dir: number) => { const items = choices(); if (!items.length) return; cursorOwnership.take("directional"); selected = (selected + dir + items.length) % items.length; setMenuSelection(selected); items[selected]?.focus(); };
    const key = (e: KeyboardEvent) => {
      setGamepadMode(false);
      if (playback.current) {
        e.preventDefault();
        const interactionKey = (localStorage.getItem("echoes:interaction-key") ?? "e").toLowerCase();
        if (historyOpen.current) {
          if (!e.repeat && ["escape", "enter", " ", interactionKey].includes(e.key.toLowerCase())) playerRef.current.closeHistory();
          else if (["ArrowUp", "PageUp", "ArrowDown", "PageDown"].includes(e.key)) historyScroll.current?.scrollBy({ top: ["ArrowUp", "PageUp"].includes(e.key) ? -180 : 180, behavior: "smooth" });
        } else if (!e.repeat && ["enter", " ", interactionKey].includes(e.key.toLowerCase())) playerRef.current.advance();
      } else if (controller.current) { e.preventDefault(); controller.current.key(e.key.toLowerCase(), e.repeat); }
      else if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Tab"].includes(e.key)) { e.preventDefault(); menuMove(e.key === "ArrowLeft" || e.key === "ArrowUp" || e.shiftKey ? -1 : 1); }
      else if (!e.repeat && ["Enter", " "].includes(e.key)) { e.preventDefault(); cursorOwnership.take("directional"); choices()[selected]?.click(); }
    };
    const unsubscribe = cursorOwnership.subscribe(owner => { setOwner(owner); if (owner === "mouse" || owner === "touch") setGamepadMode(false); });
    window.addEventListener("keydown", key);
    let raf = 0, previous = performance.now(), a = true, b = true, lt = true, menuDir = 0;
    const frame = (now: number) => {
      const pad = [...navigator.getGamepads()].find(Boolean), dt = Math.min(.05, (now - previous) / 1000); previous = now;
      if (pad) {
        const confirm = Boolean(pad.buttons[0]?.pressed), back = Boolean(pad.buttons[1]?.pressed), trigger = Boolean(pad.buttons[6]?.pressed);
        const fineX = Number(Boolean(pad.buttons[15]?.pressed)) - Number(Boolean(pad.buttons[14]?.pressed));
        const stickX = pad.axes[0] || 0, x = fineX || stickX;
        const y = (pad.buttons[13]?.pressed ? 1 : pad.buttons[12]?.pressed ? -1 : pad.axes[1]) || 0;
        const axis = (raw: number) => Math.abs(raw) <= .18 ? 0 : Math.sign(raw) * Math.min(1, (Math.abs(raw) - .18) / .82);
        const rightX = axis(pad.axes[2] || 0), rightY = axis(pad.axes[3] || 0);
        if (playback.current) {
          if (confirm && !a || back && !b || trigger && !lt || historyOpen.current && Math.abs(rightY) > .18) { setGamepadMode(true); cursorOwnership.take("directional"); }
          if (trigger && !lt) playerRef.current.toggleHistory();
          else if (historyOpen.current) {
            if (back && !b || confirm && !a) playerRef.current.closeHistory();
            else historyScroll.current?.scrollBy({ top: getDialogueHistoryRightStickScrollDelta(rightY, dt) });
          } else if (confirm && !a) playerRef.current.advance();
        } else if (controller.current) {
          if (controller.current.pad(stickX, y, confirm && !a, back && !b, dt, rightX, fineX)) setGamepadMode(true);
        } else {
          if (Math.abs(x) > .55 || Math.abs(y) > .55 || confirm && !a || back && !b) setGamepadMode(true);
          const dir = Math.abs(x) > .55 ? Math.sign(x) : Math.abs(y) > .55 ? Math.sign(y) : 0;
          if (dir && dir !== menuDir) menuMove(dir);
          if (confirm && !a) { cursorOwnership.take("directional"); choices()[selected]?.click(); }
          menuDir = dir;
        }
        a = confirm; b = back; lt = trigger;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { unsubscribe(); cancelAnimationFrame(raf); window.removeEventListener("keydown", key); };
  }, []);
  const open = async (nextSide: PlantSide) => {
    setSide(nextSide); setIntroduction(true); setSuccess(false);
    const id = nextSide === "L" ? "scene6-interaction-020" : "scene6-interaction-021";
    const result = await dialogueManager.playRegistered(id, {});
    setIntroduction(false); if (!result.completed) setSide(null);
  };
  const finish = (next: PhototropicState, solved: boolean) => { setState({ ...next, solved: next.solved || solved }); setSide(null); setSuccess(solved); };
  return <main className="game-shell" data-interaction-illustration={introduction ? "open" : undefined} style={{ position: "relative", height: "100svh", width: "100%", minHeight: 600, background: "#041719", color: "#d5e7d6", overflow: "hidden" }}
    onContextMenu={e => { e.preventDefault(); if (playback.current) { cursorOwnership.take("mouse"); playerRef.current.toggleHistory(); } }}
    onPointerDownCapture={e => {
      if (!playback.current || !e.isPrimary || e.pointerType === "mouse" && e.button !== 0) return;
      cursorOwnership.take(e.pointerType === "touch" ? "touch" : "mouse");
      if (historyOpen.current) return;
      if (!(e.target as Element).closest(".dialogue-box, .dialogue-history-trigger, .dialogue-history-overlay")) { e.preventDefault(); e.stopPropagation(); playerRef.current.advance(); }
    }}>
    <div className="plant-preview-choices" data-owner={owner} ref={buttons} style={{ padding: 30 }} onPointerDown={e => cursorOwnership.take(e.pointerType === "touch" ? "touch" : "mouse")}><h1>趨光植物 · 正式元件流程預覽</h1><p>此預覽不更動玩家存檔或任務。左右初始為空槽；兩側設定會保留。</p>
      <button disabled={side !== null} data-selected={menuSelection === 0 || undefined} onClick={() => { void open("L"); }}>互動 020 · 左側</button>{" "}
      <button disabled={side !== null} data-selected={menuSelection === 1 || undefined} onClick={() => { void open("R"); }}>互動 021 · 右側</button>{" "}
      <button disabled={side !== null} data-selected={menuSelection === 2 || undefined} onClick={() => { setState(initialPhototropicState()); setSuccess(false); }}>重置預覽</button>
      <p>左側：{state.L.slot === null ? "未放置" : `L${state.L.slot + 1} · ${state.L.angle}°`}　右側：{state.R.slot === null ? "未放置" : `R${state.R.slot + 1} · ${state.R.angle}°`}</p>
      {success && <p role="status">{PLANT_SUCCESS_MESSAGE}</p>}
    </div>
    {side && introduction && <InteractionIllustrationOverlay view={{ imagePath, withDialogue: true, closing: false, backdropOpacity: .85 }} onClose={() => {}} onError={() => dialogueManager.cancelCurrent()} />}
    {side && !introduction && <PhototropicPuzzleOverlay key={side} ref={controller} view={{ side, imagePath, initial: state }} gamepadMode={gamepadMode} onIntroduced={() => setState(previous => ({ ...previous, introduced: true }))} onInput={() => { void audio.current?.play("uiInput", { restart: true }).catch(() => {}); }} onVineMotion={motion => audio.current?.setPlantVineMotion(motion)} onSuccessDialogue={id => dialogueManager.playRegistered(id, {})} onFinish={finish} />}
    <DialoguePlayerView view={dialogueView} history={history} historyScrollable={historyScrollable} textSize={textSize} gamepadMode={gamepadMode}
      boxRef={dialogueBox} historyScrollRef={historyScroll} historyCloseRef={historyClose}
      onAdvance={player.advance} onOpenHistory={player.openHistory} onCloseHistory={player.closeHistory}
      onPointerInput={e => cursorOwnership.take(e.pointerType === "touch" ? "touch" : "mouse")} />
  </main>;
}
