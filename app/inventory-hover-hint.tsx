"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
type Hint = { itemId: string; text: string; x: number; y: number; owner: string; visible: boolean };
export function useInventoryHoverHint() {
  const [hint, setHint] = useState<Hint | null>(null);
  const current = useRef<Hint | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelTimer = () => { if (timer.current !== null) clearTimeout(timer.current); timer.current = null; };
  const clear = useCallback(() => {
    if (!current.current) return;
    cancelTimer(); current.current = null;
    setHint(h => h ? { ...h, visible: false } : null);
    timer.current = setTimeout(() => setHint(null), 50);
  }, []);
  const show = useCallback((itemId: string, text: string, x: number, y: number, owner: string) => {
    const previous = current.current;
    const same = previous?.itemId === itemId && previous.owner === owner;
    if (same && previous.x === x + 14 && previous.y === y + 18) return;
    const next = { itemId, text, x: x + 14, y: y + 18, owner, visible: same ? previous.visible : false };
    current.current = next; setHint(next);
    if (!same) {
      cancelTimer();
      timer.current = setTimeout(() => {
        if (current.current === null) return;
        current.current = { ...current.current, visible: true }; setHint(current.current);
      }, 250);
    }
  }, []);
  useEffect(() => () => cancelTimer(), []);
  return { hint, show, clear };
}
const HINT_EDGE_GAP = 8;
export function InventoryHoverHint({ hint }: { hint: Hint | null }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  // 提示預設在游標右下方；超出舞台（或視窗）時翻到游標另一側，仍不夠時貼齊邊緣
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || !hint) return;
    const shell = document.querySelector(".game-shell")?.getBoundingClientRect();
    const minX = Math.max(0, shell?.left ?? 0) + HINT_EDGE_GAP;
    const minY = Math.max(0, shell?.top ?? 0) + HINT_EDGE_GAP;
    const maxX = Math.min(window.innerWidth, shell?.right ?? window.innerWidth) - HINT_EDGE_GAP;
    const maxY = Math.min(window.innerHeight, shell?.bottom ?? window.innerHeight) - HINT_EDGE_GAP;
    const { width, height } = element.getBoundingClientRect();
    let left = hint.x, top = hint.y;
    if (left + width > maxX) left = hint.x - 28 - width;
    if (top + height > maxY) top = hint.y - 36 - height;
    element.style.left = `${Math.max(minX, Math.min(left, maxX - width))}px`;
    element.style.top = `${Math.max(minY, Math.min(top, maxY - height))}px`;
  }, [hint]);
  if (!hint || typeof document === "undefined") return null;
  return createPortal(<span ref={ref} role="tooltip" className="inventory-hover-hint" style={{ left: hint.x, top: hint.y, opacity: hint.visible ? 1 : 0 }}>{hint.text}</span>, document.body);
}
