"use client";
import { useLayoutEffect, useRef, type RefObject, type PointerEventHandler } from "react";
import { GamepadHint } from "./gamepad-button-icon";
import { resolveRuntimePublicAssetUrl } from "./public-asset-url";
import type { DialogueChoiceView, DialogueView } from "./dialogue-player";
import type { DialogueHistoryView } from "./dialogue-history";

type Props = {
  view: DialogueView; history: DialogueHistoryView | null; historyScrollable: boolean;
  textSize: "small" | "medium" | "large"; gamepadMode: boolean;
  boxRef: RefObject<HTMLButtonElement | null>; historyScrollRef: RefObject<HTMLDivElement | null>; historyCloseRef: RefObject<HTMLButtonElement | null>;
  onAdvance: () => unknown; onOpenHistory: () => unknown; onCloseHistory: () => unknown;
  onPointerInput?: PointerEventHandler<HTMLButtonElement>;
  /** 有值時在對話框右上角顯示「按 [□] 全螢幕」（與左上的回顧訊息對稱） */
  onFullscreen?: () => unknown;
  /** 對話選項視窗（最後一句之後）；開啟時點對話框不會往下，要點選項 */
  choice?: DialogueChoiceView; onChooseOption?: (index: number) => unknown; onHoverOption?: (index: number) => unknown;
};
// This is the production dialogue/history markup; previews mount the same view.
export function DialoguePlayerView({ view, history, historyScrollable, textSize, gamepadMode, boxRef, historyScrollRef, historyCloseRef, onAdvance, onOpenHistory, onCloseHistory, onPointerInput, onFullscreen, choice, onChooseOption, onHoverOption }: Props) {
  const mouseRight = resolveRuntimePublicAssetUrl("ui/input/mouse-right.svg");
  const historyTriggerRef = useRef<HTMLButtonElement | null>(null);
  const fullscreenTriggerRef = useRef<HTMLButtonElement | null>(null);
  const choiceListRef = useRef<HTMLDivElement | null>(null);
  const hasFullscreenPrompt = Boolean(onFullscreen);
  const choiceOpen = Boolean(choice && choice.options.length > 0);
  // 「訊息回顧」貼在對話框左上角外側（PC 規格：與對話框左緣對齊、上方間距 16px）。
  // 依對話框實際位置計算，UI 縮放或文字變多使對話框變高時都會跟著移動。
  useLayoutEffect(() => {
    const trigger = historyTriggerRef.current;
    const fullscreenTrigger = fullscreenTriggerRef.current;
    const choiceList = choiceListRef.current;
    const box = boxRef.current;
    const parent = (trigger ?? fullscreenTrigger ?? choiceList)?.offsetParent as HTMLElement | null;
    if ((!trigger && !fullscreenTrigger && !choiceList) || !box || !parent) return;
    const place = () => {
      const parentRect = parent.getBoundingClientRect();
      const boxRect = box.getBoundingClientRect();
      const uiScale = parseFloat(getComputedStyle(parent).getPropertyValue("--ui-scale")) || 1;
      const bottom = `${parentRect.bottom - boxRect.top + 16 * uiScale}px`;
      if (trigger) {
        trigger.style.left = `${boxRect.left - parentRect.left}px`;
        trigger.style.bottom = bottom;
      }
      // 全螢幕提示與回顧訊息對稱：右緣對齊對話框右緣
      if (fullscreenTrigger) {
        fullscreenTrigger.style.right = `${parentRect.right - boxRect.right}px`;
        fullscreenTrigger.style.bottom = bottom;
      }
      // 對話選項：右緣對齊對話框，疊在「回顧訊息／全螢幕」那一列之上，不與它們重疊
      if (choiceList) {
        const promptRowHeight = Math.max(trigger?.offsetHeight ?? 0, fullscreenTrigger?.offsetHeight ?? 0);
        choiceList.style.right = `${parentRect.right - boxRect.right}px`;
        choiceList.style.bottom = `${parentRect.bottom - boxRect.top + 16 * uiScale + (promptRowHeight ? promptRowHeight + 10 * uiScale : 0)}px`;
      }
    };
    place();
    // 對話框進場動畫（transform）不會觸發 ResizeObserver，動畫結束後再校正一次
    const settleTimer = window.setTimeout(place, 350);
    const observer = new ResizeObserver(place);
    observer.observe(box);
    observer.observe(parent);
    window.addEventListener("resize", place);
    return () => { window.clearTimeout(settleTimer); observer.disconnect(); window.removeEventListener("resize", place); };
  }, [boxRef, view?.canReview, view?.lineId, textSize, hasFullscreenPrompt, choiceOpen]);
  return <>
    {view && <>
      {view.canReview && <button ref={historyTriggerRef} className="dialogue-history-trigger" type="button" aria-haspopup="dialog" aria-expanded={Boolean(history)} aria-hidden={Boolean(history)} disabled={Boolean(history)} onPointerDown={onPointerInput} onClick={event => { event.stopPropagation(); onOpenHistory(); }}>
        {gamepadMode ? <GamepadHint text="按 [LT] 回顧訊息" /> : <><span>按</span><img className="dialogue-mouse-button-icon" src={mouseRight} alt="滑鼠右鍵" draggable={false} /><span>回顧訊息</span></>}
      </button>}
      {onFullscreen && !history && <button ref={fullscreenTriggerRef} className="dialogue-fullscreen-trigger" type="button" aria-label="進入全螢幕" onPointerDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); onFullscreen(); }}>
        <span>按</span>
        <svg className="dialogue-fullscreen-icon" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="1.5" y="1.5" width="21" height="21" rx="4" />
          <path d="M8 6.5H6.5V8M16 6.5h1.5V8M8 17.5H6.5V16M16 17.5h1.5V16" />
        </svg>
        <span>全螢幕</span>
      </button>}
      {choiceOpen && choice && !history && <div ref={choiceListRef} className="dialogue-choice-list" role="listbox" aria-label="選擇回應" onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
        {choice.options.map((label, index) => <button key={`${index}-${label}`} type="button" role="option" aria-selected={index === choice.selectedIndex}
          className={`dialogue-choice-option${index === choice.selectedIndex ? " is-selected" : ""}`}
          onPointerEnter={event => { if (event.pointerType === "mouse") onHoverOption?.(index); }}
          onClick={event => { event.stopPropagation(); onChooseOption?.(index); }}>
          <span className="dialogue-choice-index" aria-hidden="true">{index + 1}</span><span className="dialogue-choice-label">{label}</span>
        </button>)}
      </div>}
      <button ref={boxRef} className={`dialogue-box dialogue-size-${textSize}${history ? " is-history-open" : ""}${choiceOpen ? " is-choosing" : ""}`} type="button" aria-label={choiceOpen ? "對話；請選擇上方的選項" : "對話；按下顯示下一頁"} disabled={Boolean(history)} data-dialogue-id={view.dialogueId} data-line-id={view.lineId} onPointerDown={onPointerInput} onClick={choiceOpen ? undefined : onAdvance}>
        <span className="dialogue-frame-surface" aria-hidden="true" /><span className="dialogue-frame-bloom" aria-hidden="true" />
        {view.speaker && <strong className="dialogue-speaker">{view.speaker}</strong>}<span className="dialogue-text">{view.text}</span><span className="dialogue-next" aria-hidden="true" />
      </button>
    </>}
    {history && <section className="dialogue-history-overlay" role="dialog" aria-modal="true" aria-labelledby="dialogue-history-title" data-dialogue-id={history.dialogueId} onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
      <div className="dialogue-history-panel">
        <span className="dialogue-frame-surface" aria-hidden="true" /><span className="dialogue-frame-bloom" aria-hidden="true" />
        <header className="dialogue-history-header"><strong id="dialogue-history-title">訊息回顧</strong></header>
        <div className="dialogue-history-list" ref={historyScrollRef}>
          {history.entries.length ? history.entries.map(entry => <article className="dialogue-history-entry" key={entry.lineId}>{entry.speaker && <strong>{entry.speaker}</strong>}<p>{entry.text}</p></article>) : <p className="dialogue-history-empty">目前沒有更早的訊息</p>}
        </div>
        <button ref={historyCloseRef} className="dialogue-history-close" type="button" onPointerDown={onPointerInput} onClick={event => { event.stopPropagation(); onCloseHistory(); }}>
          {gamepadMode ? <GamepadHint text={historyScrollable ? "按 [LT] 關閉 ／ 推動 [右搖桿] 捲動訊息" : "按 [LT] 關閉"} /> : <><span>按</span><img className="dialogue-mouse-button-icon" src={mouseRight} alt="滑鼠右鍵" draggable={false} /><span>關閉</span></>}
        </button>
      </div>
    </section>}
  </>;
}
