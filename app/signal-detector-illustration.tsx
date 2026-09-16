"use client";
import { useEffect, useRef, useState } from "react";
import { drawSignalDetectorScreens } from "./signal-detector-screens";

export function SignalDetectorIllustration({ imagePath, onError }: {
  imagePath: string; onError: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!loaded || !ctx) return;
    let frame = 0;
    const start = performance.now();
    const draw = (now: number) => {
      if (!document.hidden) drawSignalDetectorScreens(ctx, now - start);
      frame = requestAnimationFrame(draw);
    };
    draw(start);
    return () => cancelAnimationFrame(frame);
  }, [loaded]);
  // One opacity animation composites the image and screens together, including closing.
  return <div className="interaction-illustration-artwork">
    <img src={imagePath} alt="互動插圖" draggable={false}
      onLoad={() => setLoaded(true)} onError={onError} />
    <canvas ref={canvasRef} width={1920} height={1080} aria-hidden="true" />
  </div>;
}
