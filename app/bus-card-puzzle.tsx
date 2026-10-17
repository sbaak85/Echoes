"use client";

import { useEffect, useRef, type RefObject } from "react";
import { isBusCardSolution } from "./bus-card-puzzle.ts";
import { resolveRuntimePublicAssetUrl } from "./public-asset-url";
import { cursorOwnership } from "./cursor-ownership.ts";
import "./bus-card-puzzle.css";

type Props = {
  frameRef: RefObject<HTMLIFrameElement | null>;
  initialOwner: "mouse" | "keyboard" | "gamepad" | "touch";
  onCancel: () => void;
  onComplete: () => void;
};

export function BusCardPuzzle({ frameRef, initialOwner, onCancel, onComplete }: Props) {
  const callbacks = useRef({ onCancel, onComplete });
  callbacks.current = { onCancel, onComplete };
  const settled = useRef(false);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frameRef.current?.contentWindow ||
          event.data?.channel !== "echoes-bus-card" || settled.current) return;
      if (event.data.type === "owner") {
        const owner = event.data.owner;
        if (["mouse", "touch", "keyboard", "gamepad"].includes(owner)) {
          cursorOwnership.take(owner === "mouse" || owner === "touch" ? owner : "directional");
        }
      } else if (event.data.type === "cancel") {
        settled.current = true;
        callbacks.current.onCancel();
      } else if (event.data.type === "complete" && isBusCardSolution(event.data.slots)) {
        settled.current = true;
        callbacks.current.onComplete();
      }
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [frameRef]);
  return <div className="bus-card-overlay" role="dialog" aria-modal="true" aria-label="伊薩卡號匯流排維護">
    <iframe ref={frameRef} title="匯流排導通操作面板" onLoad={() => frameRef.current?.contentWindow?.focus()}
      src={`${resolveRuntimePublicAssetUrl("minigames/bus-card/index.html")}?owner=${initialOwner}`} />
  </div>;
}
