"use client";
import type { RefObject, PointerEventHandler } from "react";
import { GamepadHint } from "./gamepad-button-icon";
import { resolveRuntimePublicAssetUrl } from "./public-asset-url";
import type { DialogueView } from "./dialogue-player";
import type { DialogueHistoryView } from "./dialogue-history";

type Props = {
  view: DialogueView; history: DialogueHistoryView | null; historyScrollable: boolean;
  textSize: "small" | "medium" | "large"; gamepadMode: boolean;
  boxRef: RefObject<HTMLButtonElement | null>; historyScrollRef: RefObject<HTMLDivElement | null>; historyCloseRef: RefObject<HTMLButtonElement | null>;
  onAdvance: () => unknown; onOpenHistory: () => unknown; onCloseHistory: () => unknown;
  onPointerInput?: PointerEventHandler<HTMLButtonElement>;
};
// This is the production dialogue/history markup; previews mount the same view.
export function DialoguePlayerView({ view, history, historyScrollable, textSize, gamepadMode, boxRef, historyScrollRef, historyCloseRef, onAdvance, onOpenHistory, onCloseHistory, onPointerInput }: Props) {
  const mouseRight = resolveRuntimePublicAssetUrl("ui/input/mouse-right.svg");
  return <>
    {view && <>
      {view.canReview && <button className="dialogue-history-trigger" type="button" aria-haspopup="dialog" aria-expanded={Boolean(history)} aria-hidden={Boolean(history)} disabled={Boolean(history)} onPointerDown={onPointerInput} onClick={event => { event.stopPropagation(); onOpenHistory(); }}>
        {gamepadMode ? <GamepadHint text="按 [LT] 回顧訊息" /> : <><span>按</span><img className="dialogue-mouse-button-icon" src={mouseRight} alt="滑鼠右鍵" draggable={false} /><span>回顧訊息</span></>}
      </button>}
      <button ref={boxRef} className={`dialogue-box dialogue-size-${textSize}${history ? " is-history-open" : ""}`} type="button" aria-label="對話；按下顯示下一頁" disabled={Boolean(history)} data-dialogue-id={view.dialogueId} data-line-id={view.lineId} onPointerDown={onPointerInput} onClick={onAdvance}>
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
