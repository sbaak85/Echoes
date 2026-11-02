"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  CHAPTER02_COUNTDOWN_CRITICAL_MS,
  CHAPTER02_COUNTDOWN_DOCK_AT_MS,
  CHAPTER02_COUNTDOWN_FREEZE_AT_MS,
  CHAPTER02_COUNTDOWN_INTRO,
  CHAPTER02_COUNTDOWN_START_MS,
  formatChapter02Countdown,
  type Chapter02CountdownView,
} from "./chapter02-crash-countdown";

type Stage = "line" | "open" | "pop" | "center" | "docked";

/**
 * 第二章墜落倒數 UI。view 變成 "intro" 時播放刷出動畫（光線拉開 → 框體展開、數字亂碼 →
 * 定格彈一下 → 中央停留 → 縮小上移）；"docked" 直接停在上方。數字每幀由 getRemainingMs 讀取。
 */
export function Chapter02CountdownOverlay({ view, introKey, getRemainingMs }: {
  view: Chapter02CountdownView;
  /** 每次重新播放刷出動畫時遞增 */
  introKey: number;
  getRemainingMs: () => number;
}) {
  // 一出現就要在正中央開始刷，不能先畫出上方的位置
  const [stage, setStage] = useState<Stage>(() => (view === "intro" ? "line" : "docked"));
  // 只有「縮小上移」那一步開啟位移動畫，其餘狀態切換都是瞬間的
  const [instant, setInstant] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);
  const minutesRef = useRef<HTMLSpanElement>(null);
  const secondsRef = useRef<HTMLSpanElement>(null);
  const centisecondsRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLElement>(null);
  const scramblingRef = useRef(false);
  const getRemainingRef = useRef(getRemainingMs);
  getRemainingRef.current = getRemainingMs;

  useLayoutEffect(() => {
    setInstant(true);
    if (view !== "intro") {
      setStage("docked");
      scramblingRef.current = false;
      return;
    }
    const { lineMs } = CHAPTER02_COUNTDOWN_INTRO;
    setStage("line");
    scramblingRef.current = true;
    const timers = [
      window.setTimeout(() => setStage("open"), lineMs),
      window.setTimeout(() => { scramblingRef.current = false; setStage("pop"); }, CHAPTER02_COUNTDOWN_FREEZE_AT_MS),
      window.setTimeout(() => setStage("center"), CHAPTER02_COUNTDOWN_FREEZE_AT_MS + CHAPTER02_COUNTDOWN_INTRO.popMs),
      window.setTimeout(() => { setInstant(false); setStage("docked"); }, CHAPTER02_COUNTDOWN_DOCK_AT_MS),
    ];
    return () => timers.forEach(timer => window.clearTimeout(timer));
  }, [view, introKey]);

  useEffect(() => {
    if (view === "hidden") return;
    let frame = 0;
    const digit = () => String(Math.floor(Math.random() * 10));
    const draw = () => {
      const remaining = getRemainingRef.current();
      if (scramblingRef.current) {
        if (minutesRef.current) minutesRef.current.textContent = digit() + digit();
        if (secondsRef.current) secondsRef.current.textContent = digit() + digit();
        if (centisecondsRef.current) centisecondsRef.current.textContent = digit() + digit();
      } else {
        const text = formatChapter02Countdown(remaining);
        if (minutesRef.current) minutesRef.current.textContent = text.minutes;
        if (secondsRef.current) secondsRef.current.textContent = text.seconds;
        if (centisecondsRef.current) centisecondsRef.current.textContent = text.centiseconds;
      }
      barRef.current?.style.setProperty("--countdown-progress", String(Math.max(0, remaining) / CHAPTER02_COUNTDOWN_START_MS));
      rootRef.current?.classList.toggle("is-critical", remaining > 0 && remaining <= CHAPTER02_COUNTDOWN_CRITICAL_MS);
      rootRef.current?.classList.toggle("is-zero", remaining <= 0);
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [view]);

  if (view === "hidden") return null;
  return (
    <>
    {/* 刷出瞬間，計時器後面的畫面模糊 0.2 秒再恢復清楚 0.2 秒 */}
    {view === "intro" && (stage === "line" || stage === "open") ? (
      <div key={introKey} className="chapter02-countdown-backdrop-blur" aria-hidden="true" />
    ) : null}
    <div
      ref={rootRef}
      className={`chapter02-countdown is-stage-${stage}${instant ? " is-instant" : ""}`}
      aria-hidden="true"
    >
      {/* 中央光線左右拉開後分成上下兩條，往上下伸展出整個框 */}
      <div className="chapter02-countdown-line is-top" />
      <div className="chapter02-countdown-line is-bottom" />
      <div className="chapter02-countdown-frame">
        <span className="chapter02-countdown-corner is-tl" />
        <span className="chapter02-countdown-corner is-tr" />
        <span className="chapter02-countdown-corner is-bl" />
        <span className="chapter02-countdown-corner is-br" />
        <div className="chapter02-countdown-label">
          <span className="chapter02-countdown-dot" />
          預估墜落時間
          <span className="chapter02-countdown-label-en">IMPACT ETA</span>
        </div>
        <div className="chapter02-countdown-digits">
          <span ref={minutesRef} />
          <span className="chapter02-countdown-sep">:</span>
          <span ref={secondsRef} />
          <span className="chapter02-countdown-sep">:</span>
          <span ref={centisecondsRef} className="chapter02-countdown-cs" />
        </div>
        <div className="chapter02-countdown-bar"><i ref={barRef} /></div>
      </div>
    </div>
    </>
  );
}
