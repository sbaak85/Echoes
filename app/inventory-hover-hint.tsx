"use client";
import { useCallback, useEffect, useRef, useState } from "react";
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
export function InventoryHoverHint({ hint }: { hint: Hint | null }) {
  if (!hint || typeof document === "undefined") return null;
  return createPortal(<span role="tooltip" className="inventory-hover-hint" style={{ left: hint.x, top: hint.y, opacity: hint.visible ? 1 : 0 }}>{hint.text}</span>, document.body);
}
