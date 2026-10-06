"use client";

import { useId, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { GamepadButtonIcon } from "./gamepad-button-icon";
import { STARSHIP_CRAFTING_TUTORIAL_VISUALS, positionStarshipCraftingTip, type StarshipCraftingTutorialStep } from "./starship-crafting-tutorial";
import "./starship-crafting-tutorial.css";

type Placement = {
  hole: { x: number; y: number; width: number; height: number };
  visualHoles: { x: number; y: number; width: number; height: number }[];
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
  const tipElement = useRef<HTMLElement | null>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [phase, setPhase] = useState<"overview" | "fading" | "ready">("overview");
  const callbacks = useRef({ onReady, onUnavailable });
  useLayoutEffect(() => { callbacks.current = { onReady, onUnavailable }; }, [onReady, onUnavailable]);
  useLayoutEffect(() => {
    if (!placement?.tip.fitted || !tipElement.current) return;
    const copy = tipElement.current.querySelector<HTMLElement>(".sct-tip-copy");
    const footer = tipElement.current.querySelector<HTMLElement>(".sct-tip-footer");
    if (!copy || !footer) return;
    // Keep the existing type size wherever it fits. Only reduce it when a
    // requested box would otherwise clip text at the current UI scale.
    const fit = (element: HTMLElement, preferred: number, overflows: () => boolean) => {
      for (let size = preferred; size >= preferred * .5; size -= .5) {
        element.style.fontSize = `${size}px`;
        if (!overflows()) break;
      }
    };
    fit(footer, Math.max(12, Math.min(15, placement.viewport.width * .01)), () => {
      const style = getComputedStyle(footer);
      const children = Array.from(footer.children);
      const contentWidth = children.reduce((sum, child) => {
        const range = document.createRange(); range.selectNodeContents(child);
        return sum + (child.classList.contains("sct-tip-arrow") ? child.getBoundingClientRect().width : range.getBoundingClientRect().width);
      }, 0);
      return contentWidth + parseFloat(style.columnGap) * (children.length - 1) +
        parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) > footer.clientWidth + 1;
    });
    fit(copy, Math.max(13, Math.min(16, placement.viewport.width * .011)), () => {
      const range = document.createRange(); range.selectNodeContents(copy);
      const style = getComputedStyle(copy);
      return range.getBoundingClientRect().height + parseFloat(style.paddingTop) +
        parseFloat(style.paddingBottom) > copy.clientHeight;
    });
  }, [placement?.tip.width, placement?.tip.height, placement?.tip.fitted, placement?.viewport.width, inputMode, step.message, phase]);
  useLayoutEffect(() => {
    let frame = 0, started = false, disposed = false;
    const timers: number[] = [];
    const startedAt = performance.now();
    const measure = () => {
      if (disposed) return;
      const button = root.current?.querySelector<HTMLElement>(step.target);
      if (button && (!(button instanceof HTMLButtonElement) || !button.disabled) && button.getClientRects().length) {
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
        const panel = step.tipLayout?.panel ? root.current?.querySelector(step.tipLayout.panel)?.getBoundingClientRect() ?? null : null;
        const next: Placement = {
          hole: { x: rect.x - 3, y: rect.y - 3, width: rect.width + 6, height: rect.height + 6 },
          visualHoles: (step.visualTargets ?? []).flatMap(selector => {
            const regions = Array.from(root.current?.querySelectorAll<HTMLElement>(selector) ?? [])
              .filter(element => element.getClientRects().length).map(element => element.getBoundingClientRect());
            if (!regions.length) return [];
            const left = Math.min(...regions.map(region => region.left)), top = Math.min(...regions.map(region => region.top));
            const right = Math.max(...regions.map(region => region.right)), bottom = Math.max(...regions.map(region => region.bottom));
            return [{ x: left - 3, y: top - 3, width: right - left + 6, height: bottom - top + 6 }];
          }),
          tip: positionStarshipCraftingTip(step, rect, anchor, viewport, tipElement.current?.getBoundingClientRect().height ?? 0, panel), viewport,
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
            {placement.visualHoles.map((hole, index) => <rect key={index} {...hole} rx="7" fill="black" filter={`url(#sct-blur-${id})`} />)}
          </mask>
        </defs>
        <rect width={placement.viewport.width} height={placement.viewport.height}
          fill={`rgba(0,0,0,${STARSHIP_CRAFTING_TUTORIAL_VISUALS.blackOpacity})`} mask={`url(#sct-hole-${id})`} />
      </svg>
      <aside ref={tipElement} className="sct-tip" data-fitted={placement.tip.fitted} style={{
        left: placement.tip.x, top: placement.tip.y, width: placement.tip.width,
        height: placement.tip.fitted ? placement.tip.height : undefined,
        minHeight: placement.tip.fitted ? undefined : step.anchor ? 112 : 94,
        "--sct-copy-size": `${Math.max(13, Math.min(16, placement.viewport.width * .011))}px`,
        "--sct-footer-size": `${Math.max(12, Math.min(15, placement.viewport.width * .01))}px`,
        "--sct-tip-unit": `${placement.tip.width / 300}px`,
      } as CSSProperties}>
        <div className="sct-tip-copy"><span className="sct-tip-text">{step.order === 7
          ? step.message.split(/(\[－\]|\[＋\])/).map((part, index) => part === "[－]" || part === "[＋]"
            ? <svg key={index} className="sct-quantity-symbol" viewBox="0 0 24 24" role="img"
              aria-label={part === "[－]" ? "減號" : "加號"} focusable="false">
              <path d={part === "[－]" ? "M5 10.5H19L20.5 12L19 13.5H5L3.5 12Z"
                : "M10.5 5L12 3.5L13.5 5V10.5H19L20.5 12L19 13.5H13.5V19L12 20.5L10.5 19V13.5H5L3.5 12L5 10.5H10.5Z"}/>
            </svg> : part)
          : step.message}</span></div>
        <div className="sct-tip-footer"><span>{inputMode === "gamepad" ? <><GamepadButtonIcon button="A" /> {step.confirmLabel ?? "確認"}</>
          : inputMode === "mobile" ? step.confirmLabel ?? "點選目標" : `點選／Enter ${step.confirmLabel ?? "確認"}`}</span><b>STEP {step.order}</b>
          <i className="sct-tip-arrow" aria-hidden="true" data-direction={placement.tip.arrowDirection}><span /></i>
        </div>
      </aside>
    </div> : null}
    {/* Only the action target opens the input shield; extra spotlight regions stay blocked. */}
    {phase !== "ready" || !placement ? <div className="sct-shield" /> : <>
      <div className="sct-shield" style={{ bottom: "auto", height: Math.max(0, placement.hole.y) }} />
      <div className="sct-shield" style={{ top: placement.hole.y + placement.hole.height }} />
      <div className="sct-shield" style={{ top: placement.hole.y, bottom: "auto", right: "auto", width: Math.max(0, placement.hole.x), height: placement.hole.height }} />
      <div className="sct-shield" style={{ top: placement.hole.y, bottom: "auto", left: placement.hole.x + placement.hole.width, height: placement.hole.height }} />
    </>}
  </div>;
}
