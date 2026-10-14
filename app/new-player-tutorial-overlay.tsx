"use client";

import { GamepadHint } from "./gamepad-button-icon";

import { useId, type CSSProperties, type PointerEvent } from "react";
import {
  getNewPlayerTutorialOperationHint,
  type NewPlayerTutorialStep,
} from "./new-player-tutorial";

export type NewPlayerTutorialSpotlight = {
  x: number;
  y: number;
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
};

type TutorialInputMode = "keyboard-mouse" | "gamepad" | "mobile";

// 行動裝置版的點擊圖示：Phosphor「hand-tap」（MIT），指尖圓弧改用箱子的黃色；見 THIRD_PARTY_NOTICES.md
const TAP_ICON_ARC = "M56,76a60,60,0,0,1,120,0,8,8,0,0,1-16,0,44,44,0,0,0-88,0,8,8,0,1,1-16,0Z";
const TAP_ICON_HAND = "M196,120a27.9,27.9,0,0,0-13.36,3.39A28,28,0,0,0,144,106.7V76a28,28,0,0,0-56,0v80l-3.82-6.13a28,28,0,0,0-48.41,28.17l29.32,50A8,8,0,1,0,78.89,220L49.6,170a12,12,0,1,1,20.78-12l.14.23,18.68,30A8,8,0,0,0,104,184V76a12,12,0,0,1,24,0v68a8,8,0,1,0,16,0V132a12,12,0,0,1,24,0v20a8,8,0,0,0,16,0v-4a12,12,0,0,1,24,0v36c0,21.61-7.1,36.3-7.16,36.42a8,8,0,0,0,3.58,10.73A7.9,7.9,0,0,0,208,232a8,8,0,0,0,7.16-4.42c.37-.73,8.85-18,8.85-43.58V148A28,28,0,0,0,196,120Z";

/** 鍵盤模式：任務 [Q]、生存 [R]（教學文字原本寫的是手把按鍵） */
function toKeyboardHint(text: string) {
  return text.replace("[RB]", "[Q]").replace("[LB]", "[R]");
}

/**
 * 行動裝置版：把教學文字中的手把按鍵換成觸控圖示，與文字同一行垂直置中。
 * [RB]／[LB]／[◀] [▶] → 點擊手型；[M] → 小地圖收合後的小圓鈕；[Y] → 快捷格（口糧圖示＋外框，不含編號與數量）
 */
function MobileTutorialText({ text, hotbarIconPath }: { text: string; hotbarIconPath?: string }) {
  const parts = text.split(/(\[◀\] \[▶\]|\[RB\]|\[LB\]|\[M\]|\[Y\])/);
  return (
    <>
      {parts.map((part, index) => {
        if (part === "[RB]" || part === "[LB]" || part === "[◀] [▶]") {
          return (
            <svg key={index} className="new-player-tutorial-tap-icon" viewBox="0 0 256 256" role="img" aria-label="點擊">
              <path fill="#ffd98a" d={TAP_ICON_ARC} />
              <path fill="currentColor" d={TAP_ICON_HAND} />
            </svg>
          );
        }
        if (part === "[M]") {
          return (
            <svg key={index} className="new-player-tutorial-minimap-icon" viewBox="0 0 24 24" role="img" aria-label="小地圖按鈕">
              <circle cx="12" cy="12" r="10.5" />
              <path d="M8.2 13.6 12 9.8l3.8 3.8" />
            </svg>
          );
        }
        if (part === "[Y]") {
          return (
            <span key={index} className="new-player-tutorial-slot-icon" role="img" aria-label="快捷格">
              {hotbarIconPath ? <img src={hotbarIconPath} alt="" draggable={false} /> : null}
            </span>
          );
        }
        return <span key={index}>{part}</span>;
      })}
    </>
  );
}

type NewPlayerTutorialOverlayProps = {
  inputMode: TutorialInputMode;
  spotlight: NewPlayerTutorialSpotlight | null;
  step: NewPlayerTutorialStep;
  targetCollapsed?: boolean;
  onContinue: () => void;
  /** 行動裝置版教學中代表快捷格的道具圖示（口糧） */
  hotbarIconPath?: string;
  /** 行動裝置版：點擊鏤空區（任務／生存／小地圖介面）時實際收折或展開該介面 */
  onToggleTarget?: () => void;
};

export function getNewPlayerTutorialHintPosition(
  spotlight: NewPlayerTutorialSpotlight,
  placement: NewPlayerTutorialStep["hintPlacement"],
  uiScale = 1,
) {
  const edge = 18;
  const gap = 34 * uiScale;
  // 卡片以 --ui-scale 縮放顯示：排版用縮放後的實際大小，style.width 傳縮放前的寬度
  const layoutWidth = Math.min(440, Math.max(280, (spotlight.viewportWidth - edge * 2) / uiScale));
  const cardWidth = layoutWidth * uiScale;
  const cardHeight = 138 * uiScale;
  const clampPosition = (value: number, minimum: number, maximum: number) =>
    Math.min(Math.max(value, minimum), Math.max(minimum, maximum));

  let left = spotlight.x - cardWidth - gap;
  let top = spotlight.y + Math.max(0, (spotlight.height - cardHeight) / 2);

  if (placement === "right") {
    left = spotlight.x + spotlight.width + gap;
  } else if (placement === "above") {
    left = spotlight.x + (spotlight.width - cardWidth) / 2;
    top = spotlight.y - cardHeight - gap;
  }

  const fitsHorizontally = left >= edge && left + cardWidth <= spotlight.viewportWidth - edge;
  // 窄畫面（手機直向）：預設寬度放不進目標旁邊時，改用目標旁剩下的寬度（不小於 150px），
  // 上緣對齊目標，卡片寬度自動縮窄、文字自動換行，仍維持在任務／生存 UI 的旁邊
  if (!fitsHorizontally && (placement === "left" || placement === "right")) {
    const sideEdge = 14;
    const sideGap = Math.min(gap, 8);
    const sideWidth = placement === "left"
      ? spotlight.x - sideGap - sideEdge
      : spotlight.viewportWidth - sideEdge - (spotlight.x + spotlight.width + sideGap);
    if (sideWidth >= 150) {
      const fittedWidth = Math.min(cardWidth, sideWidth);
      return {
        left: placement === "left" ? spotlight.x - sideGap - fittedWidth : spotlight.x + spotlight.width + sideGap,
        top: clampPosition(spotlight.y, sideEdge, spotlight.viewportHeight - cardHeight - sideEdge),
        width: fittedWidth / uiScale,
      };
    }
  }
  if (!fitsHorizontally && placement !== "above") {
    left = (spotlight.viewportWidth - cardWidth) / 2;
    top = spotlight.y + spotlight.height + 20;
    if (top + cardHeight > spotlight.viewportHeight - edge) {
      top = spotlight.y - cardHeight - 20;
    }
  }

  return {
    left: clampPosition(left, edge, spotlight.viewportWidth - cardWidth - edge),
    top: clampPosition(top, edge, spotlight.viewportHeight - cardHeight - edge),
    width: layoutWidth,
  };
}

export function NewPlayerTutorialOverlay({
  inputMode,
  spotlight,
  step,
  targetCollapsed = false,
  hotbarIconPath,
  onToggleTarget,
  onContinue,
}: NewPlayerTutorialOverlayProps) {
  const maskId = `tutorial-mask-${useId().replace(/:/g, "")}`;
  const blurId = `tutorial-blur-${useId().replace(/:/g, "")}`;
  const glowId = `tutorial-glow-${useId().replace(/:/g, "")}`;
  // 與其他 HUD 共用舞台上的 --ui-scale（手機版縮小）
  const uiScale = typeof document === "undefined"
    ? 1
    : parseFloat(getComputedStyle(document.querySelector(".game-shell") ?? document.documentElement).getPropertyValue("--ui-scale")) || 1;
  const hintPosition = spotlight
    ? getNewPlayerTutorialHintPosition(spotlight, step.hintPlacement, uiScale)
    : null;
  const prompt = inputMode === "gamepad"
    ? "按 [A]"
    : inputMode === "mobile"
      ? "點擊"
      : "按 [空白鍵]";
  // 下排三角箭頭指向說明的對象：依卡片與鏤空目標的實際相對位置決定方向
  const pointerDirection = (() => {
    if (!spotlight || !hintPosition) return "right";
    const cardWidth = hintPosition.width * uiScale;
    const cardHeight = 138 * uiScale;
    if (hintPosition.top + cardHeight <= spotlight.y + 1) return "down";
    if (hintPosition.top >= spotlight.y + spotlight.height - 1) return "up";
    const cardCenterX = hintPosition.left + cardWidth / 2;
    return spotlight.x + spotlight.width / 2 < cardCenterX ? "left" : "right";
  })();
  const operationHint = getNewPlayerTutorialOperationHint(
    step.id,
    targetCollapsed,
  );

  const stopPointerPropagation = (event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
  };

  return (
    <div
      className="new-player-tutorial-overlay"
      role="dialog"
      aria-label={`新手指引 ${step.order} / 4`}
      onPointerDown={stopPointerPropagation}
      onPointerUp={stopPointerPropagation}
    >
      <svg
        className="new-player-tutorial-mask"
        viewBox={`0 0 ${spotlight?.viewportWidth ?? 1} ${spotlight?.viewportHeight ?? 1}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <filter id={blurId} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="10" />
          </filter>
          <filter id={glowId} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="8" />
          </filter>
          <mask
            id={maskId}
            maskUnits="userSpaceOnUse"
            x="0"
            y="0"
            width={spotlight?.viewportWidth ?? 1}
            height={spotlight?.viewportHeight ?? 1}
          >
            <rect
              width={spotlight?.viewportWidth ?? 1}
              height={spotlight?.viewportHeight ?? 1}
              fill="white"
            />
            {spotlight ? (
              <g className="new-player-tutorial-spotlight" key={step.id}>
                {step.spotlightShape === "circle" ? (
                  <ellipse
                    cx={spotlight.x + spotlight.width / 2}
                    cy={spotlight.y + spotlight.height / 2}
                    rx={spotlight.width / 2}
                    ry={spotlight.height / 2}
                    fill="black"
                    filter={`url(#${blurId})`}
                  />
                ) : (
                  <rect
                    x={spotlight.x}
                    y={spotlight.y}
                    width={spotlight.width}
                    height={spotlight.height}
                    rx="7"
                    fill="black"
                    filter={`url(#${blurId})`}
                  />
                )}
              </g>
            ) : null}
          </mask>
        </defs>
        <rect
          width={spotlight?.viewportWidth ?? 1}
          height={spotlight?.viewportHeight ?? 1}
          fill="rgba(0, 0, 0, 0.7)"
          mask={`url(#${maskId})`}
        />
        {spotlight ? (
          <g className="new-player-tutorial-spotlight-glow" key={step.id}>
            {step.spotlightShape === "circle" ? (
              <ellipse
                cx={spotlight.x + spotlight.width / 2}
                cy={spotlight.y + spotlight.height / 2}
                rx={Math.max(0, spotlight.width / 2 - 2)}
                ry={Math.max(0, spotlight.height / 2 - 2)}
                fill="none"
                stroke="rgba(112, 225, 255, 0.64)"
                strokeWidth="3"
                filter={`url(#${glowId})`}
              />
            ) : (
              <rect
                x={spotlight.x + 1}
                y={spotlight.y + 1}
                width={Math.max(0, spotlight.width - 2)}
                height={Math.max(0, spotlight.height - 2)}
                rx="6"
                fill="none"
                stroke="rgba(112, 225, 255, 0.64)"
                strokeWidth="3"
                filter={`url(#${glowId})`}
              />
            )}
          </g>
        ) : null}
      </svg>

      {/* 行動裝置版：點鏤空的介面本身即收折／展開（鏤空範圍隨介面尺寸即時更新） */}
      {inputMode === "mobile" && spotlight && onToggleTarget &&
        (step.id === "quest" || step.id === "survival" || step.id === "minimap") ? (
        <button
          className="new-player-tutorial-target-hit"
          type="button"
          aria-label={targetCollapsed ? "展開介面" : "收折介面"}
          style={{
            left: spotlight.x,
            top: spotlight.y,
            width: spotlight.width,
            height: spotlight.height,
            borderRadius: step.spotlightShape === "circle" ? "50%" : undefined,
          }}
          onClick={onToggleTarget}
        />
      ) : null}

      {hintPosition ? (
        <button
          className="new-player-tutorial-hint"
          key={step.id}
          type="button"
          style={{
            left: hintPosition.left,
            top: hintPosition.top,
            width: hintPosition.width,
          } as CSSProperties}
          onClick={onContinue}
        >
          <span className="new-player-tutorial-copy">
            {inputMode === "mobile"
              ? <MobileTutorialText text={step.message} hotbarIconPath={hotbarIconPath} />
              : <GamepadHint text={step.message} enabled={inputMode === "gamepad"} />}
          </span>
          <strong className="new-player-tutorial-actions">
            <span className="new-player-tutorial-action-copy">
              <span className="new-player-tutorial-context-action">
                {inputMode === "mobile"
                  ? <MobileTutorialText text={operationHint} hotbarIconPath={hotbarIconPath} />
                  : inputMode === "gamepad"
                    ? <GamepadHint text={operationHint.replace("[M]", "[Select]")} enabled />
                    : <GamepadHint text={toKeyboardHint(operationHint)} enabled={false} />}
              </span>
              <span className="new-player-tutorial-continue">
                <GamepadHint text={prompt} enabled={inputMode === "gamepad"} /> {step.actionLabel}
              </span>
              <b>{step.order} / 4</b>
              <i className={`is-${pointerDirection}`} aria-hidden="true">▶</i>
            </span>
          </strong>
        </button>
      ) : null}
    </div>
  );
}
