"use client";

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

type NewPlayerTutorialOverlayProps = {
  inputMode: TutorialInputMode;
  spotlight: NewPlayerTutorialSpotlight | null;
  step: NewPlayerTutorialStep;
  targetCollapsed?: boolean;
  onContinue: () => void;
};

export function getNewPlayerTutorialHintPosition(
  spotlight: NewPlayerTutorialSpotlight,
  placement: NewPlayerTutorialStep["hintPlacement"],
) {
  const edge = 18;
  const gap = 34;
  const cardWidth = Math.min(440, Math.max(280, spotlight.viewportWidth - edge * 2));
  const cardHeight = 138;
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
  if (!fitsHorizontally) {
    left = (spotlight.viewportWidth - cardWidth) / 2;
    top = spotlight.y + spotlight.height + 20;
    if (top + cardHeight > spotlight.viewportHeight - edge) {
      top = spotlight.y - cardHeight - 20;
    }
  }

  return {
    left: clampPosition(left, edge, spotlight.viewportWidth - cardWidth - edge),
    top: clampPosition(top, edge, spotlight.viewportHeight - cardHeight - edge),
    width: cardWidth,
  };
}

export function NewPlayerTutorialOverlay({
  inputMode,
  spotlight,
  step,
  targetCollapsed = false,
  onContinue,
}: NewPlayerTutorialOverlayProps) {
  const maskId = `tutorial-mask-${useId().replace(/:/g, "")}`;
  const blurId = `tutorial-blur-${useId().replace(/:/g, "")}`;
  const glowId = `tutorial-glow-${useId().replace(/:/g, "")}`;
  const hintPosition = spotlight
    ? getNewPlayerTutorialHintPosition(spotlight, step.hintPlacement)
    : null;
  const prompt = inputMode === "gamepad"
    ? "按 [A]"
    : inputMode === "mobile"
      ? "點擊"
      : "按 [空白鍵]";
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
          <span className="new-player-tutorial-copy">{step.message}</span>
          <strong className="new-player-tutorial-actions">
            <span className="new-player-tutorial-context-action">
              {operationHint}
            </span>
            <span className="new-player-tutorial-continue">
              {prompt} {step.actionLabel}
            </span>
            <b>{step.order} / 4</b>
            <i aria-hidden="true">▶</i>
          </strong>
        </button>
      ) : null}
    </div>
  );
}
