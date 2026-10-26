"use client";

import { useEffect, useRef, type RefObject } from "react";
import { NAV_TERMINAL_MESSAGE_CHANNEL, isNavTerminalCleared } from "./nav-terminal-minigame.ts";
import { resolveRuntimePublicAssetUrl } from "./public-asset-url";
import { cursorOwnership } from "./cursor-ownership.ts";
import "./nav-terminal-minigame.css";

type Props = {
  frameRef: RefObject<HTMLIFrameElement | null>;
  initialOwner: "mouse" | "keyboard" | "gamepad" | "touch";
  onCancel: () => void;
  onComplete: () => void;
  onInput: () => void;
  onClear: () => void;
  onInputRejected: () => void;
  onBlockCalibrated: () => void;
  onMatrixScanChange: (active: boolean) => void;
};

export function NavTerminalMinigame({ frameRef, initialOwner, onCancel, onComplete, onInput, onClear, onInputRejected, onBlockCalibrated, onMatrixScanChange }: Props) {
  const callbacks = useRef({ onCancel, onComplete, onInput, onClear, onInputRejected, onBlockCalibrated, onMatrixScanChange });
  callbacks.current = { onCancel, onComplete, onInput, onClear, onInputRejected, onBlockCalibrated, onMatrixScanChange };
  const settled = useRef(false);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frameRef.current?.contentWindow ||
          event.data?.channel !== NAV_TERMINAL_MESSAGE_CHANNEL || settled.current) return;
      if (event.data.type === "owner") {
        const owner = event.data.owner;
        if (["mouse", "touch", "keyboard", "gamepad"].includes(owner)) {
          cursorOwnership.take(owner === "mouse" || owner === "touch" ? owner : "directional");
        }
      } else if (event.data.type === "input") {
        callbacks.current.onInput();
      } else if (event.data.type === "clear") {
        callbacks.current.onClear();
      } else if (event.data.type === "input-rejected") {
        callbacks.current.onInputRejected();
      } else if (event.data.type === "block-calibrated") {
        callbacks.current.onBlockCalibrated();
      } else if (event.data.type === "matrix-scan") {
        callbacks.current.onMatrixScanChange(event.data.active === true);
      } else if (event.data.type === "cancel") {
        settled.current = true;
        callbacks.current.onCancel();
      } else if (event.data.type === "complete" && isNavTerminalCleared(event.data.solved)) {
        settled.current = true;
        callbacks.current.onComplete();
      }
    };
    window.addEventListener("message", receive);
    return () => {
      window.removeEventListener("message", receive);
      // 離開小遊戲（返回船艙或過關關閉）時刷動音一律淡出
      callbacks.current.onMatrixScanChange(false);
    };
  }, [frameRef]);
  return <div className="nav-terminal-overlay" role="dialog" aria-modal="true" aria-label="航線監測終端">
    <iframe ref={frameRef} title="航線監測終端" onLoad={() => frameRef.current?.contentWindow?.focus()}
      src={`${resolveRuntimePublicAssetUrl("minigames/nav-terminal/index.html")}?owner=${initialOwner}`} />
  </div>;
}
