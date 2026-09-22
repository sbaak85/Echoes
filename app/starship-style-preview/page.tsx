"use client";

import { useEffect, useRef, useState } from "react";
import { StarshipInteractionMenu, type StarshipInteractionMenuController } from "../starship-interaction-menu";

export default function StarshipStylePreview() {
  const controller = useRef<StarshipInteractionMenuController>(null);
  const [inputMode, setInputMode] = useState<"keyboard-mouse" | "gamepad" | "mobile">("keyboard-mouse");
  const [instance, setInstance] = useState(0);
  useEffect(() => {
    let frame = 0;
    let previousA = false;
    let previousB = false;
    let lastMove = 0;
    const poll = (now: number) => {
      const pad = Array.from(navigator.getGamepads()).find(Boolean);
      if (pad) {
        const up = pad.buttons[12]?.pressed || pad.axes[1] < -0.6;
        const down = pad.buttons[13]?.pressed || pad.axes[1] > 0.6;
        const a = !!pad.buttons[0]?.pressed;
        const b = !!pad.buttons[1]?.pressed;
        if (up || down || (a && !previousA) || (b && !previousB)) {
          setInputMode("gamepad");
          controller.current?.setControlMode("directional");
        }
        if ((up || down) && now - lastMove > 180) {
          controller.current?.move(up ? "up" : "down");
          lastMove = now;
        }
        if (a && !previousA) controller.current?.activate();
        if (b && !previousB) controller.current?.back();
        previousA = a; previousB = b;
      } else { previousA = false; previousB = false; }
      frame = requestAnimationFrame(poll);
    };
    frame = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(frame);
  }, []);
  return <div className="starship-style-preview">
    <StarshipInteractionMenu key={instance} ref={controller} inputMode={inputMode}
      onInputModeChange={setInputMode} onControlModeChange={() => {}} onInput={() => {}}
      onSleep={() => setInstance(value => value + 1)} onClose={() => setInstance(value => value + 1)}
      inventory={{}} onCraft={() => ({ ok: false, reason: "視覺預覽" })} />
  </div>;
}
