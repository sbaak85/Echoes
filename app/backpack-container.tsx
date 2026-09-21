import type { CSSProperties } from "react";
import "./backpack-container.css";

/** Approved hybrid backpack silhouette; the gradient is fixed to the container, not the load. */
export function BackpackContainer({ percent }: { percent: number }) {
  const fill = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));
  return <div className={`backpack-container${fill === 100 ? " is-full" : ""}${fill === 0 ? " is-empty" : ""}`}
    role="img" aria-label={`背包容量 ${Math.round(fill)}%`}
    style={{ "--fill": `${fill}%`, "--fill-level": `${108.4 - .828 * fill}px` } as CSSProperties}>
    <i className="handle" /><i className="side left" /><i className="side right" />
    <i className="body" /><i className="seam" /><i className="flap"><i className="lid-fill" /></i>
    <i className="pocket" /><i className="strap left" /><i className="strap right" /><i className="tag" />
  </div>;
}
