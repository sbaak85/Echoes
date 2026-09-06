"use client";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Keep feedback outside the summary's scrollable content. */
export function InventorySurvivalFloat({ children }: { children: ReactNode }) {
  const anchor = useRef<HTMLSpanElement>(null);
  const float = useRef<HTMLDivElement>(null);
  const [overlay, setOverlay] = useState<Element | null>(null);
  const active = Boolean(children);
  useLayoutEffect(() => {
    if (!active) return;
    const row = anchor.current?.parentElement;
    const root = row?.closest(".inventory-overlay");
    const scroller = row?.closest(".inventory-summary-panel");
    if (!row || !root || !scroller) return;
    setOverlay(root);
    let frame = 0;
    const position = () => {
      if (float.current) {
        const r = row.getBoundingClientRect();
        const o = root.getBoundingClientRect();
        const clip = scroller.getBoundingClientRect();
        float.current.style.left = `${r.right - o.left}px`;
        float.current.style.top = `${r.top - o.top}px`;
        float.current.style.visibility = r.bottom > clip.top && r.top < clip.bottom ? "visible" : "hidden";
      }
      frame = requestAnimationFrame(position);
    };
    position();
    return () => cancelAnimationFrame(frame);
  }, [active]);
  return <>
    <span ref={anchor} hidden />
    {active && overlay ? createPortal(
      <div className="inventory-survival-float-layer" aria-hidden="true">
        <div ref={float} className="inventory-survival-float-anchor">{children}</div>
      </div>, overlay,
    ) : null}
  </>;
}
