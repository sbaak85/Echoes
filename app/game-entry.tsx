"use client";

import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import "./game-entry.css";
import {
  CHAPTER_AUTO_START_INLINE_SCRIPT,
  hideChapterHandoffCover,
  showChapterHandoffCover,
  takeChapterAutoStart,
} from "./chapter02-ending";

const endChapterHandoff = () => hideChapterHandoffCover();

export function GameEntry() {
  const [Game, setGame] = useState<ComponentType | null>(null);
  const [selected, setSelected] = useState(0);
  const [owner, setOwner] = useState("directional");
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
    selectedRef.current = (index + 2) % 2;
    setSelected(selectedRef.current);
  }, []);

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
    if (Game) return;
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
          setOwner("directional");
          select(selectedRef.current + direction);
          nextMove = time + (lastDirection === direction ? 180 : 350);
        }
        if (confirm) {
          armed = false;
          setOwner("directional");
          void choose(selectedRef.current === 0 ? 2 : 3);
        }
      }
      lastDirection = direction;
      frame = requestAnimationFrame(tick);
    };
    const blur = () => { armed = false; lastDirection = 0; };
    const key = (event: KeyboardEvent) => {
      if (busy.current || event.repeat) return;
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Tab"].includes(event.key)) {
        event.preventDefault(); setOwner("directional");
        select(selectedRef.current + (event.key === "ArrowUp" || event.key === "ArrowLeft" || event.shiftKey ? -1 : 1));
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault(); setOwner("directional");
        void choose(selectedRef.current === 0 ? 2 : 3);
      }
    };
    window.addEventListener("keydown", key);
    window.addEventListener("blur", blur);
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("keydown", key); window.removeEventListener("blur", blur); };
  }, [Game, choose, select]);

  if (Game) return <Game />;
  return <main className="chapter-entry" data-owner={owner} aria-busy={loading}
    onPointerMove={(event) => { if (event.pointerType === "mouse") setOwner("mouse"); }}
    onPointerDown={(event) => setOwner(event.pointerType === "touch" ? "touch" : "mouse")}>
    {/* 在 HTML 解析時同步執行：有章節交接標記就先全黑，避免重新載入時閃出選單 */}
    <script dangerouslySetInnerHTML={{ __html: CHAPTER_AUTO_START_INLINE_SCRIPT }} />
    <section aria-labelledby="chapter-entry-title">
      <p className="chapter-entry-kicker">遠星迴聲</p>
      <h1 id="chapter-entry-title">選擇起始章節</h1>
      <div className="chapter-entry-options">
        {([2, 3] as const).map((chapter, index) => <button key={chapter} type="button"
          disabled={loading} data-selected={selected === index}
          onFocus={() => select(index)} onClick={() => void choose(chapter)}>
          <span>CHAPTER {String(chapter).padStart(2, "0")}</span>
          <strong>{chapter === 2 ? "第二章" : "第三章"}</strong>
          <small>{chapter === 2 ? "突如其來的意外" : "存活的準備"}</small>
        </button>)}
      </div>
      <p className="chapter-entry-note" role="status">{loading ? "正在載入場景…" : "選擇章節開始新遊戲。可使用滑鼠、觸控、方向鍵或手把操作。"}</p>
      {error && <p role="alert">{error}</p>}
    </section>
  </main>;
}
