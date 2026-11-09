"use client";
// 序章劇情畫面：全黑背景，不載入地圖。黑畫面白字幕 → 對話框＋插圖 → 「序章結束」字幕 → onComplete（進入第二章）。
// 對話框與訊息回顧沿用遊戲內同一套 DialoguePlayerView／createDialoguePlayer；插圖沿用互動插圖的版面與淡入規格。
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from "react";
import { AudioEventManager, type AudioEventName } from "./audio-event-manager";
import { cursorOwnership } from "./cursor-ownership";
import { CURSOR_HANDOFF_VISIBLE_STORAGE_KEY, CURSOR_POSITION_STORAGE_KEY } from "./cursor-presentation";
import { hasDialogueHistoryScrollbar, type DialogueHistoryView } from "./dialogue-history";
import { createDialoguePlayer, type DialoguePlayback, type DialogueTyping, type DialogueView } from "./dialogue-player";
import { DialoguePlayerView } from "./dialogue-player-view";
import type { InteractionDialogueScript } from "./interaction-flow";
import {
  getPrologueSubtitleTiming,
  PROLOGUE_ILLUSTRATION_FADE_IN_MS,
  PROLOGUE_ILLUSTRATION_FADE_OUT_MS,
  PROLOGUE_SCENE_GAP_MS,
  resolvePrologueSequence,
} from "./prologue-flow";
import { resolveRuntimePublicAssetUrl } from "./public-asset-url";
import { STORY_CHAPTERS } from "./story-content";
import type { StorySubtitleEventDefinition } from "./story-subtitle-flow";
import "./prologue-player.css";

type CenteredText = {
  lines: { text: string; fontSizePx?: number }[];
  fadeInMs: number; holdMs: number; fadeOutMs: number; sequence: number;
};
type Illustration = { src: string; closing: boolean; sequence: number };
type Context = { dialogue?: InteractionDialogueScript | null };

const PROLOGUE_AUDIO_EVENTS: readonly AudioEventName[] = ["dialogueTyping", "dialogueOpened", "uiInput"];
const DIALOGUE_UI_SELECTOR = ".dialogue-box, .dialogue-history-trigger, .dialogue-history-overlay";

export function ProloguePlayer({ onComplete }: { onComplete: () => void }) {
  const [centered, setCentered] = useState<CenteredText | null>(null);
  const [illustration, setIllustration] = useState<Illustration | null>(null);
  const [view, setView] = useState<DialogueView>(null);
  const [history, setHistory] = useState<DialogueHistoryView | null>(null);
  const [historyScrollable, setHistoryScrollable] = useState(false);
  const [gamepadMode, setGamepadMode] = useState(false);
  // 遊戲游標（滑鼠操作時跟著滑鼠）：從章節選單沿用最後的滑鼠位置；鍵盤／手把操作時隱藏
  const [pointer, setPointer] = useState(() => cursorOwnership.owner === "mouse" ? cursorOwnership.lastMouse : null);
  const [pointerHidden, setPointerHidden] = useState(false);
  const [pointerOverDialogue, setPointerOverDialogue] = useState(false);
  const [textSize] = useState<"small" | "large">(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 680px), (pointer: coarse)").matches ? "large" : "small");
  const shellRef = useRef<HTMLDivElement | null>(null);
  const boxRef = useRef<HTMLButtonElement | null>(null);
  const historyScrollRef = useRef<HTMLDivElement | null>(null);
  const historyCloseRef = useRef<HTMLButtonElement | null>(null);
  const audioRef = useRef<AudioEventManager | null>(null);
  const pointerHiddenRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const playSe = (eventName: AudioEventName) => {
    void audioRef.current?.play(eventName, { restart: true }).catch(() => {
      // 瀏覽器暫時封鎖播放時維持安靜，不中斷劇情
    });
  };

  const playerRef = useRef<ReturnType<typeof createDialoguePlayer<Context>> | null>(null);
  if (!playerRef.current) {
    const playback: { current: DialoguePlayback<Context> | null } = { current: null };
    const typing: { current: DialogueTyping | null } = { current: null };
    const historyOpen = { current: false };
    playerRef.current = createDialoguePlayer<Context>({
      playback, typing, historyOpen, setView, setHistory,
      setTimer: (callback, delay) => window.setTimeout(callback, delay),
      clearTimer: (timer) => window.clearTimeout(timer),
      onTypingStart: (restart) => {
        const current = typing.current;
        if (!current || current.visibleCount >= current.characters.length || document.hidden) return;
        void audioRef.current?.play("dialogueTyping", { restart }).catch(() => {
          // 下一次鍵盤或滑鼠操作後瀏覽器才允許播放
        });
      },
      onTypingStop: () => audioRef.current?.stop("dialogueTyping"),
      onStart: () => { document.documentElement.classList.add("dialogue-cursor-active"); playSe("dialogueOpened"); },
      onClose: () => document.documentElement.classList.remove("dialogue-cursor-active"),
      onHistoryOpen: () => {
        playSe("uiInput");
        window.requestAnimationFrame(() => {
          const list = historyScrollRef.current;
          if (list) list.scrollTop = list.scrollHeight;
          historyCloseRef.current?.focus({ preventScroll: true });
        });
      },
      onHistoryClose: () => {
        playSe("uiInput");
        window.requestAnimationFrame(() => boxRef.current?.focus({ preventScroll: true }));
      },
    });
  }
  const player = playerRef.current;

  // 劇情流程
  useEffect(() => {
    const audio = new AudioEventManager({ eventNames: PROLOGUE_AUDIO_EVENTS });
    audioRef.current = audio;
    let cancelled = false;
    let illustrationSequence = 0;
    const timers = new Set<number>();
    const wait = (ms: number) => new Promise<void>((resolve) => {
      if (ms <= 0) { resolve(); return; }
      const timer = window.setTimeout(() => { timers.delete(timer); resolve(); }, ms);
      timers.add(timer);
    });
    const showSubtitle = async (event: StorySubtitleEventDefinition) => {
      const timing = getPrologueSubtitleTiming(event);
      await wait(timing.delayBeforeMs);
      if (cancelled) return;
      setCentered({ lines: timing.lines, fadeInMs: timing.fadeInMs, holdMs: timing.holdMs, fadeOutMs: timing.fadeOutMs, sequence: Date.now() });
      await wait(timing.fadeInMs + timing.holdMs + timing.fadeOutMs);
      if (cancelled) return;
      setCentered(null);
      await wait(timing.delayAfterMs);
    };
    const playDialogue = (id: string, dialogue: InteractionDialogueScript) => new Promise<void>((resolve) => {
      player.present(id, { dialogue }, () => resolve(), dialogue);
    });
    const handOffPointer = () => {
      // 第二章一開始就在同一位置畫出遊戲游標（滑鼠操作時），不會消失後又冒出一個新的
      try {
        if (cursorOwnership.owner !== "mouse" || !cursorOwnership.lastMouse || pointerHiddenRef.current) return;
        sessionStorage.setItem(CURSOR_POSITION_STORAGE_KEY, JSON.stringify(cursorOwnership.lastMouse));
        sessionStorage.setItem(CURSOR_HANDOFF_VISIBLE_STORAGE_KEY, "1");
      } catch { /* 游標位置只是體驗上的延續，存不了也不影響流程 */ }
    };

    void (async () => {
      const { steps, end } = resolvePrologueSequence(STORY_CHAPTERS as unknown as Parameters<typeof resolvePrologueSequence>[0]);
      for (const step of steps) {
        if (cancelled) return;
        if (step.kind === "subtitle") {
          await showSubtitle(step.event);
          continue;
        }
        illustrationSequence += 1;
        setIllustration({ src: resolveRuntimePublicAssetUrl(step.imagePath), closing: false, sequence: illustrationSequence });
        await wait(PROLOGUE_ILLUSTRATION_FADE_IN_MS);
        for (const section of step.dialogues) {
          if (cancelled) return;
          await playDialogue(section.id, section.dialogue);
        }
        if (cancelled) return;
        setIllustration((current) => current && { ...current, closing: true });
        await wait(PROLOGUE_ILLUSTRATION_FADE_OUT_MS);
        if (cancelled) return;
        setIllustration(null);
        await wait(PROLOGUE_SCENE_GAP_MS);
      }
      if (cancelled) return;
      if (end) await showSubtitle(end);
      if (cancelled) return;
      handOffPointer();
      onCompleteRef.current();
    })();

    return () => {
      cancelled = true;
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
      player.close();
      audio.dispose();
      if (audioRef.current === audio) audioRef.current = null;
      document.documentElement.classList.remove("dialogue-cursor-active", "gamepad-input-active");
    };
  }, [player]);

  // UI 縮放：與遊戲相同，舞台小於 1024×576 時依比例縮小（下限 0.6）
  useLayoutEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const update = () => {
      const scale = Math.min(1, Math.max(0.6, Math.min(shell.clientWidth / 1024, shell.clientHeight / 576)));
      shell.style.setProperty("--ui-scale", String(scale));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(shell);
    return () => observer.disconnect();
  }, []);

  // 訊息回顧是否需要捲軸（手把提示文字用）
  useLayoutEffect(() => {
    const list = historyScrollRef.current;
    setHistoryScrollable(Boolean(list && hasDialogueHistoryScrollbar(list.scrollHeight, list.clientHeight)));
  }, [history]);

  // 輸入：鍵盤 Enter／Space／E、滑鼠點擊、手把 A 前進；滑鼠右鍵／手把 LT 開關訊息回顧
  useEffect(() => {
    const takeDirectional = (gamepad: boolean) => {
      pointerHiddenRef.current = true;
      setPointerHidden(true);
      setGamepadMode(gamepad);
      document.documentElement.classList.add("gamepad-input-active");
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key === "enter" || key === " " || key === "e") {
        event.preventDefault();
        takeDirectional(false);
        if (!event.repeat) player.advance();
      } else if (key === "escape" || key === "backspace") {
        if (player.closeHistory()) event.preventDefault();
      }
    };
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") {
        pointerHiddenRef.current = true;
        setPointerHidden(true);
        return;
      }
      if (!cursorOwnership.recordMouse(event.clientX, event.clientY, event.type === "pointerdown")) return;
      pointerHiddenRef.current = false;
      setPointerHidden(false);
      setGamepadMode(false);
      document.documentElement.classList.remove("gamepad-input-active");
      setPointer({ x: event.clientX, y: event.clientY });
      setPointerOverDialogue(event.target instanceof Element && event.target.closest(DIALOGUE_UI_SELECTOR) !== null);
    };
    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      player.toggleHistory();
    };
    let frame = 0;
    let previous: boolean[] | null = null;
    const poll = () => {
      const pad = Array.from(navigator.getGamepads?.() ?? []).find((entry) => entry?.connected);
      if (pad) {
        const pressed = pad.buttons.map((button) => button.pressed);
        // 第一次讀到時只記錄狀態：章節選單按下的 A 不會直接跳過第一句
        if (previous) {
          const edge = (index: number) => pressed[index] && !previous![index];
          const moved = pad.axes.some((axis) => Math.abs(axis) > 0.55);
          if (pressed.some((value, index) => value && !previous![index]) || moved) takeDirectional(true);
          if (edge(0)) player.advance();
          if (edge(6)) player.toggleHistory();
          if (edge(1)) player.closeHistory();
        }
        previous = pressed;
      } else {
        previous = null;
      }
      frame = window.requestAnimationFrame(poll);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerdown", onPointerMove);
    window.addEventListener("contextmenu", onContextMenu);
    frame = window.requestAnimationFrame(poll);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerMove);
      window.removeEventListener("contextmenu", onContextMenu);
    };
  }, [player]);

  // 點對話框以外的地方也能前進（對話框本身由 DialoguePlayerView 處理）
  const onStageClick = (event: ReactMouseEvent) => {
    if (event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest(DIALOGUE_UI_SELECTOR)) return;
    player.advance();
  };

  const showPointer = Boolean(pointer) && !pointerHidden && !pointerOverDialogue && !history;
  return <main className="prologue-stage" aria-label="序章" onClick={onStageClick}>
    <div ref={shellRef} className="game-shell prologue-shell" data-interaction-illustration={illustration ? "open" : undefined}>
      {illustration && <div key={illustration.sequence}
        className={`interaction-illustration-overlay is-with-dialogue prologue-illustration${illustration.closing ? " is-closing" : ""}`}
        aria-hidden="true">
        <img src={illustration.src} alt="" draggable={false} />
      </div>}
      {centered && <section key={centered.sequence} className="story-centered-text is-fade-only"
        style={{
          "--story-text-fade-in": `${centered.fadeInMs}ms`,
          "--story-text-fade-out": `${centered.fadeOutMs}ms`,
          "--story-text-fade-out-delay": `${centered.fadeInMs + centered.holdMs}ms`,
        } as CSSProperties} aria-live="polite">
        {centered.lines.map((line, index) => <p key={`${index}-${line.text}`}
          style={line.fontSizePx ? { fontSize: `max(${Math.min(line.fontSizePx, 13)}px, calc(${line.fontSizePx}px * var(--story-text-scale, 1)))` } : undefined}>
          {line.text}
        </p>)}
      </section>}
      <DialoguePlayerView view={view} history={history} historyScrollable={historyScrollable}
        textSize={textSize} gamepadMode={gamepadMode}
        boxRef={boxRef} historyScrollRef={historyScrollRef} historyCloseRef={historyCloseRef}
        onAdvance={player.advance} onOpenHistory={player.openHistory} onCloseHistory={player.closeHistory} />
    </div>
    {showPointer && pointer && <ProloguePointer x={pointer.x} y={pointer.y} dialogue={Boolean(view)} />}
  </main>;
}

/** 與遊戲內滑鼠游標相同的圖形：平常是菱形，對話中是書本 */
function ProloguePointer({ x, y, dialogue }: { x: number; y: number; dialogue: boolean }) {
  return <svg className="prologue-pointer" style={{ left: x, top: y }} viewBox="-24 -24 64 48" width="64" height="48" aria-hidden="true">
    <defs>
      <linearGradient id="prologue-pointer-edge" x1="-13" y1="-13" x2="13" y2="13" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#e0faff" /><stop offset=".42" stopColor="#91d9ed" /><stop offset=".72" stopColor="#579bb5" /><stop offset="1" stopColor="#b8ebfa" />
      </linearGradient>
      <linearGradient id="prologue-pointer-fill" x1="-7" y1="-13" x2="7" y2="13" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#294c60" /><stop offset=".5" stopColor="#142d3e" /><stop offset="1" stopColor="#07131f" />
      </linearGradient>
      <filter id="prologue-pointer-glow" x="-50%" y="-50%" width="200%" height="200%">
        <feDropShadow dx="0" dy="0" stdDeviation="1.6" floodColor="#86d8f2" />
      </filter>
    </defs>
    <g className="prologue-pointer-pulse" filter="url(#prologue-pointer-glow)">
      {dialogue ? <g strokeLinejoin="round" strokeLinecap="round">
        <path d="M0 -10 L-13 -14 L-18 -10 L-18 9 L-4 9 L0 13 L4 9 L18 9 L18 -10 L13 -14 Z" fill="#05121be6" stroke="#86d8f2" strokeWidth="1" />
        <path d="M-16 -10 L-12 -12 L0 -9 L12 -12 L16 -10 M0 -9 L0 10" fill="none" stroke="#dcfaff" strokeWidth="1" />
        <path d="M-13 -4 L-5 -3 M5 -3 L13 -4 M-13 1 L-5 2 M5 2 L13 1" fill="none" stroke="#86d8f266" strokeWidth="1" />
        {[25, 31, 37].map((cx) => <circle key={cx} cx={cx} cy={4} r={1.3} fill="#dcfaff" />)}
      </g> : <g>
        <path d="M0 -13 L13 0 L0 13 L-13 0 Z" fill="url(#prologue-pointer-fill)" stroke="url(#prologue-pointer-edge)" strokeWidth="1.4" />
        <path d="M0 -17 L0 -21 M17 0 L21 0 M0 17 L0 21 M-17 0 L-21 0" stroke="#b9eaff" strokeWidth="1" strokeLinecap="round" />
        <circle cx="0" cy="0" r="1.2" fill="#dcfaff" />
      </g>}
    </g>
  </svg>;
}
