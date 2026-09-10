"use client";
import { useId, useLayoutEffect, useRef, useState } from "react";

/** One outline, including the pointer: all strokes sample the same panel-space gradient. */
export function AssignFrame() {
  const ref = useRef<HTMLSpanElement>(null);
  const id = useId().replace(/:/g, "");
  const [geometry, setGeometry] = useState({ width:280, height:280, tip:32 });
  useLayoutEffect(() => {
    const panel = ref.current?.parentElement;
    if (!panel) return;
    const update = () => {
      const width = panel.clientWidth, height = panel.clientHeight;
      const arrow = parseFloat(panel.style.getPropertyValue("--assign-arrow-left"));
      const tip = Math.max(17, Math.min(width - 17, (Number.isFinite(arrow) ? arrow : 24) + 8));
      setGeometry(old => old.width === width && old.height === height && old.tip === tip ? old : {width,height,tip});
    };
    update();
    const resize = new ResizeObserver(update);
    resize.observe(panel);
    const changes = new MutationObserver(update);
    changes.observe(panel, {attributes:true, attributeFilter:["style"]});
    return () => { resize.disconnect(); changes.disconnect(); };
  }, []);
  const {width:w, height:h, tip:x} = geometry;
  const points = [[8,.5],[w-8,.5],[w-.5,8],[w-.5,h-8],[w-8,h-.5],[x+8,h-.5],[x,h+9],[x-8,h-.5],[8,h-.5],[.5,h-8],[.5,8]];
  const path = `M${points.map(point => point.join(",")).join("L")}Z`;
  const clipPath = `polygon(${points.map(([px,py]) => `${px}px ${py}px`).join(",")})`;
  return <span ref={ref} className="assign-unified-frame" aria-hidden="true">
    <span className="assign-unified-fill" style={{clipPath}} />
    <svg width="100%" height="100%" viewBox={`0 0 ${w} ${h+10}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`${id}-edge`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff"/><stop offset=".06" stopColor="#dcfaff"/>
          <stop offset=".18" stopColor="#86d8f2"/><stop offset=".38" stopColor="#294657"/>
          <stop offset=".62" stopColor="#294657"/><stop offset=".82" stopColor="#86d8f2"/>
          <stop offset=".94" stopColor="#dcfaff"/><stop offset="1" stopColor="#fff"/>
        </linearGradient>
        <filter id={`${id}-bloom`} x="-25%" y="-25%" width="150%" height="150%"><feGaussianBlur stdDeviation="2"/></filter>
      </defs>
      <path d={path} fill="none" stroke={`url(#${id}-edge)`} strokeWidth="2" opacity=".65" filter={`url(#${id}-bloom)`}/>
      <path d={path} fill="none" stroke={`url(#${id}-edge)`} strokeWidth="1" strokeLinejoin="round"/>
    </svg>
  </span>;
}
