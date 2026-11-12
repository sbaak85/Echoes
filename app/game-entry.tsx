"use client";

import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import "./game-entry.css";
import {
  CHAPTER_AUTO_START_INLINE_SCRIPT,
  hideChapterHandoffCover,
  showChapterHandoffCover,
  takeChapterAutoStart,
} from "./chapter02-ending";
import { cursorOwnership } from "./cursor-ownership";
import { PROLOGUE_NEXT_CHAPTER } from "./prologue-flow";
import { preloadPrologueIllustrations, stopPrologueIllustrationPreload } from "./prologue-preload";

const endChapterHandoff = () => hideChapterHandoffCover();

/** 章節選單（由上而下）：序章、第二章、第三章 */
const ENTRY_OPTIONS = [
  { id: "prologue", kicker: "PROLOGUE", title: "序章", subtitle: "人類的希望" },
  { id: 2, kicker: "CHAPTER 02", title: "第二章", subtitle: "突如其來的意外" },
  { id: 3, kicker: "CHAPTER 03", title: "第三章", subtitle: "存活的準備" },
] as const;
type EntryOptionId = (typeof ENTRY_OPTIONS)[number]["id"];

export function GameEntry() {
  const [Game, setGame] = useState<ComponentType | null>(null);
  const [ProloguePlayer, setProloguePlayer] = useState<ComponentType<{ onComplete: () => void; initialGamepadMode?: boolean }> | null>(null);
  const [selected, setSelected] = useState(0);
  const [owner, setOwner] = useState("directional");
  const [gamepadMode, setGamepadMode] = useState(false);
  const takeDirectional = useCallback((gamepad = false) => {
    cursorOwnership.take("directional"); setOwner("directional"); setGamepadMode(gamepad);
  }, []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const selectedRef = useRef(0);
  const autoStartChapterRef = useRef<2 | 3 | null | undefined>(undefined);
  const choose = useCallback(async (chapter: 2 | 3 | null) => {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    setError("");
    // 不播序章（或序章已播完）：停止還沒下載的序章插圖，頻寬讓給地圖與遊戲模組
    stopPrologueIllustrationPreload();
    try {
      // No game/scene/story module is requested before a chapter is selected.
      const gameModule = await import("./movement-lab");
      if (chapter !== null) await gameModule.prepareChapterStart(chapter);
      setGame(() => gameModule.MovementLab);
      endChapterHandoff();
    } catch (cause) {
      endChapterHandoff();
      setError(`載入失敗，請重新選擇章節。${cause instanceof Error ? cause.message : ""}`);
      busy.current = false;
      setLoading(false);
    }
  }, []);
  const select = useCallback((index: number) => {
    selectedRef.current = (index + ENTRY_OPTIONS.length) % ENTRY_OPTIONS.length;
    setSelected(selectedRef.current);
  }, []);
  // 序章：不載入地圖，直接播放序章劇情畫面；播完（序章結束字幕之後）照「選擇第二章」的流程進入第二章
  const startPrologue = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    setError("");
    try {
      const prologueModule = await import("./prologue-player");
      setProloguePlayer(() => prologueModule.ProloguePlayer);
      // 序章播放期間先在背景載入遊戲模組，序章結束後能直接接上第二章
      void import("./movement-lab").catch(() => {});
    } catch (cause) {
      setError(`載入失敗，請重新選擇章節。${cause instanceof Error ? cause.message : ""}`);
      busy.current = false;
      setLoading(false);
    }
  }, []);
  const chooseOption = useCallback((id: EntryOptionId) => {
    if (id === "prologue") void startPrologue();
    else void choose(id);
  }, [choose, startPrologue]);
  const finishPrologue = useCallback(() => {
    busy.current = false;
    void choose(PROLOGUE_NEXT_CHAPTER);
  }, [choose]);

  useEffect(() => {
    // 章節結尾交接（例：第二章墜毀後）：重新載入後不顯示選單，全黑直接開始下一章
    // 標記只讀一次（StrictMode 重跑 effect 時沿用同一個結果）
    if (autoStartChapterRef.current === undefined) autoStartChapterRef.current = takeChapterAutoStart();
    const chapter = autoStartChapterRef.current;
    if (chapter === null) { endChapterHandoff(); return; }
    showChapterHandoffCover();
    const frame = requestAnimationFrame(() => { void choose(chapter); });
    return () => cancelAnimationFrame(frame);
  }, [choose]);

  useEffect(() => {
    // Preserve the existing dedicated scene-preview URL contract.
    if (!new URLSearchParams(location.search).has("scene")) return;
    const frame = requestAnimationFrame(() => { void choose(null); });
    return () => cancelAnimationFrame(frame);
  }, [choose]);

  useEffect(() => {
    // 章節選單一出現就依播放順序預載序章插圖（章節交接自動開始、場景預覽網址不會停在選單，不預載）
    if (autoStartChapterRef.current || new URLSearchParams(location.search).has("scene")) return;
    preloadPrologueIllustrations();
  }, []);

  useEffect(() => {
    if (Game || ProloguePlayer) return;
    let frame = 0, armed = false, nextMove = 0, lastDirection = 0;
    const tick = (time: number) => {
      const pad = Array.from(navigator.getGamepads?.() ?? []).find((entry) => entry?.connected);
      const confirm = !!pad?.buttons[0]?.pressed;
      const axis = pad?.axes[1] ?? 0;
      const direction = pad?.buttons[12]?.pressed || axis < -.55 ? -1
        : pad?.buttons[13]?.pressed || axis > .55 ? 1 : 0;
      if (!confirm && !direction) armed = true;
      if (armed && !busy.current) {
        if (direction && (!lastDirection || direction !== lastDirection || time >= nextMove)) {
          takeDirectional(true);
          select(selectedRef.current + direction);
          nextMove = time + (lastDirection === direction ? 180 : 350);
        }
        if (confirm) {
          armed = false;
          takeDirectional(true);
          chooseOption(ENTRY_OPTIONS[selectedRef.current].id);
        }
      }
      lastDirection = direction;
      frame = requestAnimationFrame(tick);
    };
    const blur = () => { armed = false; lastDirection = 0; };
    const key = (event: KeyboardEvent) => {
      if (busy.current || event.repeat) return;
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Tab"].includes(event.key)) {
        event.preventDefault(); takeDirectional();
        select(selectedRef.current + (event.key === "ArrowUp" || event.key === "ArrowLeft" || event.shiftKey ? -1 : 1));
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault(); takeDirectional();
        chooseOption(ENTRY_OPTIONS[selectedRef.current].id);
      }
    };
    window.addEventListener("keydown", key);
    window.addEventListener("blur", blur);
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("keydown", key); window.removeEventListener("blur", blur); };
  }, [Game, ProloguePlayer, chooseOption, select, takeDirectional]);

  if (Game) return <Game />;
  if (ProloguePlayer) return <ProloguePlayer onComplete={finishPrologue} initialGamepadMode={gamepadMode} />;
  return <main className="chapter-entry" data-owner={owner} aria-busy={loading}
    onPointerMove={(event) => {
      if (event.pointerType !== "mouse") return;
      setGamepadMode(false);
      setOwner("mouse");
      // 記下滑鼠位置：進入序章或遊戲後，遊戲游標從同一位置開始
      cursorOwnership.recordMouse(event.clientX, event.clientY);
    }}
    onPointerDown={(event) => {
      setGamepadMode(false);
      if (event.pointerType !== "mouse") cursorOwnership.take("touch");
      setOwner(event.pointerType === "touch" ? "touch" : "mouse");
      if (event.pointerType === "mouse") cursorOwnership.recordMouse(event.clientX, event.clientY, true);
    }}>
    {/* 在 HTML 解析時同步執行：有章節交接標記就先全黑，避免重新載入時閃出選單 */}
    <script dangerouslySetInnerHTML={{ __html: CHAPTER_AUTO_START_INLINE_SCRIPT }} />
    <section aria-labelledby="chapter-entry-title">
      <p className="chapter-entry-kicker">遠星迴聲</p>
      <h1 id="chapter-entry-title">選擇起始章節</h1>
      <div className="chapter-entry-options">
        {ENTRY_OPTIONS.map((option, index) => <button key={option.id} type="button"
          disabled={loading} data-selected={selected === index}
          onFocus={() => select(index)} onClick={() => chooseOption(option.id)}>
          <span>{option.kicker}</span>
          <strong>{option.title}</strong>
          <small>{option.subtitle}</small>
        </button>)}
      </div>
      <p className="chapter-entry-note" role="status">{loading ? "正在載入場景…" : "選擇章節開始新遊戲。可使用滑鼠、觸控、方向鍵或手把操作。"}</p>
      {error && <p role="alert">{error}</p>}
    </section>
  </main>;
}
