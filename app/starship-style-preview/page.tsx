"use client";

import { AudioEventManager } from "../audio-event-manager";
import { useEffect, useRef, useState } from "react";
import { StarshipInteractionMenu, type StarshipInteractionMenuController } from "../starship-interaction-menu";

export default function StarshipStylePreview() {
  const audio = useRef<AudioEventManager|null>(null);
  useEffect(()=>{const manager=new AudioEventManager();audio.current=manager;return()=>{manager.dispose();audio.current=null;};},[]);
  const controller = useRef<StarshipInteractionMenuController>(null);
  const [inputMode, setInputMode] = useState<"keyboard-mouse" | "gamepad" | "mobile">("keyboard-mouse");
  const inputModeRef=useRef(inputMode);inputModeRef.current=inputMode;
  const [instance, setInstance] = useState(0);
  useEffect(() => {
    let frame = 0;
    let previousA = false;
    let previousB = false;
    let previousY = false;
    let lastMove = 0;
    const poll = (now: number) => {
      const pad = Array.from(navigator.getGamepads()).find(Boolean);
      if (pad) {
        const up = pad.buttons[12]?.pressed || pad.axes[1] < -0.6;
        const down = pad.buttons[13]?.pressed || pad.axes[1] > 0.6;
        const left = pad.buttons[14]?.pressed || pad.axes[0] < -0.6;
        const right = pad.buttons[15]?.pressed || pad.axes[0] > 0.6;
        const a = !!pad.buttons[0]?.pressed;
        const b = !!pad.buttons[1]?.pressed;
        const y = !!pad.buttons[3]?.pressed;
        if (up || down || left || right || (a && !previousA) || (b && !previousB)) {
          if(inputModeRef.current!=="gamepad"){setInputMode("gamepad");frame=requestAnimationFrame(poll);return;}
          setInputMode("gamepad");
          controller.current?.setControlMode("directional");
        }
        if ((up || down || left || right) && now - lastMove > 180) {
          controller.current?.move(up ? "up" : down ? "down" : left ? "left" : "right");
          lastMove = now;
        }
        if (a && !previousA) controller.current?.activate();
        if (b && !previousB) controller.current?.back();
        if (y && !previousY) controller.current?.inspect?.();
        previousA = a; previousB = b;previousY=y;
      } else { previousA = false; previousB = false;previousY=false; }
      frame = requestAnimationFrame(poll);
    };
    frame = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(frame);
  }, []);
  return <div className="starship-style-preview">
    <StarshipInteractionMenu key={instance} ref={controller} inputMode={inputMode}
      onInputModeChange={setInputMode} onControlModeChange={() => {}} onInput={() => {void audio.current?.play("uiInput",{restart:true}).catch(()=>{});}}
      onSleep={() => setInstance(value => value + 1)} onClose={() => setInstance(value => value + 1)}
      inventory={{}} onCraft={() => ({ ok: false, reason: "視覺預覽" })} />
  </div>;
}
