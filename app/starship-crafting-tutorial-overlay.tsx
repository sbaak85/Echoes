"use client";

import { useId, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { GamepadButtonIcon } from "./gamepad-button-icon";
import { STARSHIP_CRAFTING_TUTORIAL_VISUALS, positionStarshipCraftingTip, type StarshipCraftingTutorialStep } from "./starship-crafting-tutorial";
import "./starship-crafting-tutorial.css";

type Placement = {
  hole: { x: number; y: number; width: number; height: number };
  tip: ReturnType<typeof positionStarshipCraftingTip>;
  viewport: { width: number; height: number };
};

export function StarshipCraftingTutorialOverlay({ step, root, inputMode, onReady, onUnavailable }: {
  step: StarshipCraftingTutorialStep;
  root: RefObject<HTMLDivElement | null>;
  inputMode: "keyboard-mouse" | "gamepad" | "mobile";
  onReady: (stepId: string) => void;
  onUnavailable: (stepId: string) => void;
}) {
  const id = useId().replace(/:/g, "");
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [phase, setPhase] = useState<"overview" | "fading" | "ready">("overview");
  const callbacks = useRef({ onReady, onUnavailable });
  useLayoutEffect(() => { callbacks.current = { onReady, onUnavailable }; }, [onReady, onUnavailable]);
  useLayoutEffect(() => {
    let frame = 0, started = false, disposed = false;
    const timers: number[] = [];
    const startedAt = performance.now();
    const measure = () => {
      if (disposed) return;
      const button = root.current?.querySelector<HTMLButtonElement>(step.target);
      if (button && !button.disabled && button.getClientRects().length) {
        const scroller = button.closest<HTMLElement>(".recipe-list");
        if (scroller && !started) {
          const row = button.getBoundingClientRect(), box = scroller.getBoundingClientRect();
          const scale = box.height / Math.max(1, scroller.clientHeight);
          if (row.top < box.top) scroller.scrollTop -= (box.top - row.top) / scale;
          if (row.bottom > box.bottom) scroller.scrollTop += (row.bottom - box.bottom) / scale;
        }
        const rect = button.getBoundingClientRect();
        const viewport = { width: window.innerWidth, height: window.innerHeight };
        const anchor = step.anchor ? root.current?.querySelector(step.anchor)?.getBoundingClientRect() ?? null : null;
        const next: Placement = {
          hole: { x: rect.x - 3, y: rect.y - 3, width: rect.width + 6, height: rect.height + 6 },
          tip: positionStarshipCraftingTip(step, rect, anchor, viewport), viewport,
        };
        setPlacement(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
        if (!started) {
          started = true;
          const fade = () => {
            if (disposed) return;
            setPhase("fading");
            timers.push(window.setTimeout(() => {
              if (disposed) return;
              setPhase("ready"); callbacks.current.onReady(step.id);
            }, STARSHIP_CRAFTING_TUTORIAL_VISUALS.fadeMs));
          };
          if (step.holdMs) timers.push(window.setTimeout(fade, step.holdMs));
          else fade();
        }
      } else if (performance.now() - startedAt > 2000) {
        // A removed/hidden recipe must not strand the player behind an input lock.
        callbacks.current.onUnavailable(step.id);
        return;
      }
      frame = requestAnimationFrame(measure);
    };
    frame = requestAnimationFrame(measure);
    return () => { disposed = true; cancelAnimationFrame(frame); timers.forEach(window.clearTimeout); };
  }, [root, step]);

  return <div className="starship-crafting-tutorial-overlay" data-tutorial-phase={phase}
    role="region" aria-label={`飛船製作教學 STEP ${step.order}`}>
    {phase !== "overview" && placement ? <div className="sct-mask-and-tip"
      style={{ animationDuration: `${STARSHIP_CRAFTING_TUTORIAL_VISUALS.fadeMs}ms` }}>
      <svg className="sct-mask" viewBox={`0 0 ${placement.viewport.width} ${placement.viewport.height}`} aria-hidden="true">
        <defs>
          <filter id={`sct-blur-${id}`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation={STARSHIP_CRAFTING_TUTORIAL_VISUALS.holeBlurPx} />
          </filter>
          <mask id={`sct-hole-${id}`} maskUnits="userSpaceOnUse" x="0" y="0" width={placement.viewport.width} height={placement.viewport.height}>
            <rect width={placement.viewport.width} height={placement.viewport.height} fill="white" />
            <rect {...placement.hole} rx="7" fill="black" filter={`url(#sct-blur-${id})`} />
          </mask>
        </defs>
        <rect width={placement.viewport.width} height={placement.viewport.height}
          fill={`rgba(0,0,0,${STARSHIP_CRAFTING_TUTORIAL_VISUALS.blackOpacity})`} mask={`url(#sct-hole-${id})`} />
      </svg>
      <aside className="sct-tip" style={{ left: placement.tip.x, top: placement.tip.y, width: placement.tip.width, minHeight: placement.tip.height }}>
        <div className="sct-tip-copy">{step.message}</div>
        <div className="sct-tip-footer"><span>{inputMode === "gamepad" ? <><GamepadButtonIcon button="A" /> 確認</>
          : inputMode === "mobile" ? "點選目標" : "點選／Enter 確認"}</span><b>STEP {step.order}</b>
          <i className="sct-tip-arrow" aria-hidden="true" data-direction={placement.tip.arrowDirection}><span /></i>
        </div>
      </aside>
    </div> : null}
    {phase !== "ready" || !placement ? <div className="sct-shield" /> : <>
      <div className="sct-shield" style={{ bottom: "auto", height: Math.max(0, placement.hole.y) }} />
      <div className="sct-shield" style={{ top: placement.hole.y + placement.hole.height }} />
      <div className="sct-shield" style={{ top: placement.hole.y, bottom: "auto", right: "auto", width: Math.max(0, placement.hole.x), height: placement.hole.height }} />
      <div className="sct-shield" style={{ top: placement.hole.y, bottom: "auto", left: placement.hole.x + placement.hole.width, height: placement.hole.height }} />
    </>}
  </div>;
}
