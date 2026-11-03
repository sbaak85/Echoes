"use client";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type RefObject } from "react";
import { WarpExitSmearRenderer } from "./warp-exit-smear";

export type WarpExitSmearOverlayHandle = { setAmount: (amount: number) => void };

/** 疊在遊戲畫布正上方（對話框、HUD 之下）；拉痕量為 0 時隱藏並釋放 WebGL。 */
export const WarpExitSmearOverlay = forwardRef<WarpExitSmearOverlayHandle, { source: RefObject<HTMLCanvasElement | null> }>(
  function WarpExitSmearOverlay({ source }, ref) {
    const [visible, setVisible] = useState(false);
    const amountRef = useRef(0);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    useImperativeHandle(ref, () => ({
      setAmount: value => {
        amountRef.current = Math.max(0, Math.min(1, value));
        setVisible(amountRef.current > 0);
      },
    }), []);
    useEffect(() => {
      if (!visible) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const renderer = new WarpExitSmearRenderer(canvas);
      let frame = 0;
      const draw = () => {
        const sourceCanvas = source.current;
        // 沒有 WebGL 時藏起來，維持原本的遊戲畫面
        if (sourceCanvas) canvas.style.visibility = renderer.render(sourceCanvas, amountRef.current) ? "visible" : "hidden";
        frame = requestAnimationFrame(draw);
      };
      draw();
      return () => { cancelAnimationFrame(frame); renderer.dispose(); };
    }, [visible, source]);
    return visible ? <canvas ref={canvasRef} className="warp-exit-smear" aria-hidden="true" /> : null;
  },
);
