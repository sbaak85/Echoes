"use client";
// 序章劇情畫面：全黑背景，不載入地圖。黑畫面白字幕 → 對話框＋插圖 → 「序章結束」字幕 → onComplete（進入第二章）。
// 對話框與訊息回顧沿用遊戲內同一套 DialoguePlayerView／createDialoguePlayer；插圖沿用互動插圖的版面與淡入規格。
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from "react";
import { AudioEventManager, DEFAULT_BGM_USER_VOLUME, type AudioEventName } from "./audio-event-manager";
import { cursorOwnership, type CursorOwner } from "./cursor-ownership";
import { PrologueGamepadInput } from "./prologue-gamepad";
import { CURSOR_HANDOFF_VISIBLE_STORAGE_KEY, CURSOR_POSITION_STORAGE_KEY } from "./cursor-presentation";
import { getDialogueHistoryRightStickScrollDelta, hasDialogueHistoryScrollbar, type DialogueHistoryView } from "./dialogue-history";
import { createDialoguePlayer, type DialoguePlayback, type DialogueTyping, type DialogueView } from "./dialogue-player";
import { DialoguePlayerView } from "./dialogue-player-view";
import type { InteractionDialogueScript } from "./interaction-flow";
import {
  getPrologueSubtitleTiming,
  getPrologueBgmFadeOutMs,
  PROLOGUE_BGM_SOURCE,
  PROLOGUE_BGM_TRACK_VOLUME,
  PROLOGUE_ILLUSTRATION_FADE_IN_MS,
  PROLOGUE_ILLUSTRATION_FADE_OUT_MS,
  PROLOGUE_SCENE_GAP_MS,
  resolvePrologueSequence,
} from "./prologue-flow";
import { loadPrologueIllustration, preloadPrologueIllustrations, PROLOGUE_ILLUSTRATION_LOAD_TIMEOUT_MS } from "./prologue-preload";
import { resolveRuntimePublicAssetUrl } from "./public-asset-url";
import { detectStageFullscreen, subscribeStageFullscreenChanges } from "./stage-fullscreen";
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

/** 插圖 <img> 掛上後等它解碼完成再開始淡入（載入失敗也照常顯示，不會一直是黑的） */
function markIllustrationReady(image: HTMLImageElement | null) {
  if (!image) return;
  const ready = () => image.classList.add("is-ready");
  if (typeof image.decode === "function") void image.decode().then(ready, ready);
  else if (image.complete) ready();
  else { image.addEventListener("load", ready, { once: true }); image.addEventListener("error", ready, { once: true }); }
}

export function ProloguePlayer({ onComplete, initialGamepadMode = false }: { onComplete: () => void; initialGamepadMode?: boolean }) {
  const [centered, setCentered] = useState<CenteredText | null>(null);
  const [illustration, setIllustration] = useState<Illustration | null>(null);
  const [view, setView] = useState<DialogueView>(null);
  const [history, setHistory] = useState<DialogueHistoryView | null>(null);
  const [historyScrollable, setHistoryScrollable] = useState(false);
  // F11／瀏覽器全螢幕時舞台撐滿整個畫面（與第二章以後的遊戲相同）
  const [stageFullscreen, setStageFullscreen] = useState(() => detectStageFullscreen());
  const [gamepadMode, setGamepadMode] = useState(initialGamepadMode);
  const [inputOwner, setInputOwner] = useState<CursorOwner>(() => cursorOwnership.owner);
  // 滑鼠／右搖桿共用同一個游標；鍵盤、左搖桿與方向鍵操作時隱藏。
  const [pointer, setPointer] = useState(() => cursorOwnership.owner === "mouse" ? cursorOwnership.lastMouse : null);
  const [pointerHidden, setPointerHidden] = useState(() => cursorOwnership.owner !== "mouse");
  const [pointerOverDialogue, setPointerOverDialogue] = useState(false);
  const [textSize] = useState<"small" | "large">(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 680px), (pointer: coarse)").matches ? "large" : "small");
  const shellRef = useRef<HTMLDivElement | null>(null);
  const boxRef = useRef<HTMLButtonElement | null>(null);
  const historyScrollRef = useRef<HTMLDivElement | null>(null);
  const historyCloseRef = useRef<HTMLButtonElement | null>(null);
  const audioRef = useRef<AudioEventManager | null>(null);
  const pointerHiddenRef = useRef(cursorOwnership.owner !== "mouse");
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
    const showSubtitle = async (event: StorySubtitleEventDefinition, onShown?: () => void) => {
      const timing = getPrologueSubtitleTiming(event);
      await wait(timing.delayBeforeMs);
      if (cancelled) return;
      onShown?.();
      setCentered({ lines: timing.lines, fadeInMs: timing.fadeInMs, holdMs: timing.holdMs, fadeOutMs: timing.fadeOutMs, sequence: Date.now() });
      await wait(timing.fadeInMs + timing.holdMs + timing.fadeOutMs);
      if (cancelled) return;
      setCentered(null);
      await wait(timing.delayAfterMs);
    };
    const playDialogue = (id: string, dialogue: InteractionDialogueScript) => new Promise<void>((resolve) => {
      player.present(id, { dialogue }, () => resolve(), dialogue);
    });
    // 序章 BGM：一開始就循環播放，直到「序章結束」字幕出現時淡出
    const bgmVolume = PROLOGUE_BGM_TRACK_VOLUME * DEFAULT_BGM_USER_VOLUME;
    const bgm = new Audio(resolveRuntimePublicAssetUrl(PROLOGUE_BGM_SOURCE));
    bgm.loop = true;
    bgm.preload = "auto";
    bgm.volume = bgmVolume;
    let bgmFadeFrame = 0;
    /** 「序章結束」淡出完成後不再恢復播放 */
    let bgmFinished = false;
    const resumeAfterInput = () => {
      window.removeEventListener("pointerdown", resumeAfterInput, true);
      window.removeEventListener("keydown", resumeAfterInput, true);
      startBgm();
    };
    // 分頁在背景（切換分頁、視窗最小化）時不播；與遊戲本體相同，回到前景才從原位置繼續
    function startBgm() {
      if (cancelled || bgmFinished || document.hidden) return;
      void bgm.play().catch(() => {
        // 瀏覽器封鎖自動播放時，等玩家下一次操作再開始
        window.addEventListener("pointerdown", resumeAfterInput, true);
        window.addEventListener("keydown", resumeAfterInput, true);
      });
    }
    startBgm();
    const fadeOutBgm = (durationMs: number) => {
      const startedAt = performance.now();
      const startVolume = bgm.volume;
      const step = (now: number) => {
        const progress = durationMs <= 0 ? 1 : Math.min(1, (now - startedAt) / durationMs);
        bgm.volume = startVolume * (1 - progress);
        if (progress < 1) { bgmFadeFrame = window.requestAnimationFrame(step); return; }
        bgmFinished = true;
        bgm.pause();
      };
      bgmFadeFrame = window.requestAnimationFrame(step);
    };
    // 與遊戲本體（movement-lab 的 onVisibilityChange）相同：分頁進背景時暫停 BGM 與所有音效，回到前景從原位置繼續
    const onVisibilityChange = () => {
      if (document.hidden) {
        bgm.pause();
        audio.stop("dialogueTyping", { reset: false });
        audio.setSuspended(true);
      } else {
        audio.setSuspended(false);
        startBgm();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    const handOffPointer = () => {
      // 第二章一開始就在同一位置畫出遊戲游標（滑鼠操作時），不會消失後又冒出一個新的
      try {
        if (cursorOwnership.owner !== "mouse" || !cursorOwnership.lastMouse || pointerHiddenRef.current) return;
        sessionStorage.setItem(CURSOR_POSITION_STORAGE_KEY, JSON.stringify(cursorOwnership.lastMouse));
        sessionStorage.setItem(CURSOR_HANDOFF_VISIBLE_STORAGE_KEY, "1");
      } catch { /* 游標位置只是體驗上的延續，存不了也不影響流程 */ }
    };

    // 章節選單已經開始預載；直接進序章（或預載被中斷）時在這裡補上
    preloadPrologueIllustrations();
    void (async () => {
      const { steps, end } = resolvePrologueSequence(STORY_CHAPTERS as unknown as Parameters<typeof resolvePrologueSequence>[0]);
      for (const step of steps) {
        if (cancelled) return;
        if (step.kind === "subtitle") {
          await showSubtitle(step.event);
          continue;
        }
        // 插圖還沒下載／解碼好時先停在黑畫面等它（最多 10 秒），載好才淡入，不會淡入一半才冒出圖
        const src = resolveRuntimePublicAssetUrl(step.imagePath);
        await Promise.race([loadPrologueIllustration(src), wait(PROLOGUE_ILLUSTRATION_LOAD_TIMEOUT_MS)]);
        if (cancelled) return;
        illustrationSequence += 1;
        setIllustration({ src, closing: false, sequence: illustrationSequence });
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
      // 「序章結束」字幕出現的同時開始淡出 BGM，與字幕一起淡出結束
      const bgmFadeOutMs = getPrologueBgmFadeOutMs(end);
      if (end) await showSubtitle(end, () => fadeOutBgm(bgmFadeOutMs));
      else fadeOutBgm(bgmFadeOutMs);
      if (cancelled) return;
      handOffPointer();
      onCompleteRef.current();
    })();

    return () => {
      cancelled = true;
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
      window.cancelAnimationFrame(bgmFadeFrame);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pointerdown", resumeAfterInput, true);
      window.removeEventListener("keydown", resumeAfterInput, true);
      bgm.pause();
      bgm.removeAttribute("src");
      bgm.load();
      player.close();
      audio.dispose();
      if (audioRef.current === audio) audioRef.current = null;
      document.documentElement.classList.remove("dialogue-cursor-active", "gamepad-input-active");
    };
  }, [player]);

  useEffect(() => {
    const update = () => setStageFullscreen(detectStageFullscreen());
    update();
    return subscribeStageFullscreenChanges(update);
  }, []);

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
    const input = new PrologueGamepadInput();
    let virtualPoint = cursorOwnership.lastMouse;
    const applyOwner = (owner: CursorOwner) => {
      const hidden = owner === "directional" || owner === "touch";
      pointerHiddenRef.current = hidden;
      setPointerHidden(hidden);
      setInputOwner(owner);
      document.documentElement.classList.toggle("gamepad-input-active", owner !== "mouse");
      document.documentElement.classList.toggle("gamepad-cursor-active", owner === "gamepad");
      document.documentElement.dataset.cursorOwner = owner;
    };
    applyOwner(cursorOwnership.owner);
    const unsubscribe = cursorOwnership.subscribe(applyOwner);
    const takeDirectional = (gamepad: boolean) => {
      if (!gamepad) input.reset();
      cursorOwnership.take("directional");
      setGamepadMode(gamepad);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key === "enter" || key === " " || key === "e") {
        event.preventDefault();
        takeDirectional(false);
        if (!event.repeat && !player.closeHistory()) player.advance();
      } else if (key === "escape" || key === "backspace") {
        takeDirectional(false);
        if (player.closeHistory()) event.preventDefault();
      }
    };
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") {
        input.reset();
        cursorOwnership.take("touch");
        setGamepadMode(false);
        return;
      }
      const previousOwner = cursorOwnership.owner;
      if (!cursorOwnership.recordMouse(event.clientX, event.clientY, event.type === "pointerdown")) return;
      if (previousOwner !== "mouse") input.reset();
      setGamepadMode(false);
      applyOwner("mouse");
      virtualPoint = { x: event.clientX, y: event.clientY };
      setPointer({ x: event.clientX, y: event.clientY });
      setPointerOverDialogue(event.target instanceof Element && event.target.closest(DIALOGUE_UI_SELECTOR) !== null);
    };
    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      player.toggleHistory();
    };
    let frame = 0;
    let previousTime = 0;
    const poll = (time: number) => {
      const delta = Math.min(0.05, Math.max(0, (time - (previousTime || time)) / 1000));
      previousTime = time;
      const pad = Array.from(navigator.getGamepads?.() ?? []).find((entry) => entry?.connected);
      const controls = input.sample(document.hidden ? null : pad ?? null);
      const historyList = historyScrollRef.current;
      if (controls.directional) takeDirectional(true);
      else if (controls.x || controls.y) {
        setGamepadMode(true);
        if (historyList) {
          takeDirectional(true);
          historyList.scrollTop += getDialogueHistoryRightStickScrollDelta(controls.y, delta);
        } else {
          const point = virtualPoint ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 };
          virtualPoint = {
            x: Math.max(0, Math.min(window.innerWidth - 1, point.x + controls.x * 700 * delta)),
            y: Math.max(0, Math.min(window.innerHeight - 1, point.y + controls.y * 700 * delta)),
          };
          cursorOwnership.take("gamepad");
          setPointer(virtualPoint);
        }
      }
      if (controls.history || controls.back) {
        takeDirectional(true);
        if (controls.history) player.toggleHistory();
        else player.closeHistory();
        input.reset();
      } else if (controls.confirm) {
        setGamepadMode(true);
        if (historyList) { takeDirectional(true); player.closeHistory(); input.reset(); }
        else if (cursorOwnership.owner === "gamepad" && virtualPoint) {
          const target = document.elementFromPoint(virtualPoint.x, virtualPoint.y);
          const button = target?.closest<HTMLButtonElement>(".prologue-stage button");
          if (button && !button.disabled) button.click();
          else if (target?.closest(".prologue-stage") && !target.closest(DIALOGUE_UI_SELECTOR)) player.advance();
        } else { takeDirectional(true); player.advance(); }
      }
      if (!pad && cursorOwnership.owner === "gamepad") takeDirectional(false);
      frame = window.requestAnimationFrame(poll);
    };
    const rearm = () => {
      input.reset(); previousTime = 0;
      if (cursorOwnership.owner === "gamepad") takeDirectional(true);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointermove", onPointerMove, true);
    window.addEventListener("pointerdown", onPointerMove, true);
    window.addEventListener("blur", rearm);
    window.addEventListener("contextmenu", onContextMenu);
    frame = window.requestAnimationFrame(poll);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointermove", onPointerMove, true);
      window.removeEventListener("pointerdown", onPointerMove, true);
      window.removeEventListener("blur", rearm);
      unsubscribe();
      document.documentElement.classList.remove("gamepad-input-active", "gamepad-cursor-active");
      window.removeEventListener("contextmenu", onContextMenu);
    };
  }, [player]);

  // 點對話框以外的地方也能前進（對話框本身由 DialoguePlayerView 處理）
  const onStageClick = (event: ReactMouseEvent) => {
    if (event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest(DIALOGUE_UI_SELECTOR)) return;
    player.advance();
  };

  const showPointer = Boolean(pointer) && !pointerHidden && !history && (inputOwner === "gamepad" || !pointerOverDialogue);
  return <main className="prologue-stage" data-input-owner={inputOwner} aria-label="序章" onClick={onStageClick}>
    <div ref={shellRef} className={`game-shell prologue-shell${stageFullscreen ? " is-fullscreen" : ""}`} data-interaction-illustration={illustration ? "open" : undefined}>
      {illustration && <div key={illustration.sequence}
        className={`interaction-illustration-overlay is-with-dialogue prologue-illustration${illustration.closing ? " is-closing" : ""}`}
        aria-hidden="true"
        style={{
          "--prologue-illustration-fade-in": `${PROLOGUE_ILLUSTRATION_FADE_IN_MS}ms`,
          "--prologue-illustration-fade-out": `${PROLOGUE_ILLUSTRATION_FADE_OUT_MS}ms`,
        } as CSSProperties}>
        {/* 解碼完成才加 is-ready 開始淡入：圖還沒畫出來時不先把淡入時間用掉 */}
        <img ref={markIllustrationReady} src={illustration.src} alt="" draggable={false} />
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
