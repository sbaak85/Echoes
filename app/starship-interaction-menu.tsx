"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { GamepadButtonIcon } from "./gamepad-button-icon";
import "./starship-interaction-menu.css";

type View = "main" | "sleep" | "craft" | "repair";
type InputMode = "keyboard-mouse" | "gamepad" | "mobile";
type NavigationDirection = "left" | "right" | "up" | "down";
export type StarshipSleepOption = "eight-hours" | "tomorrow-six";
export type StarshipInteractionControlMode = "pointer" | "directional" | "cursor" | "touch";
export type StarshipInteractionMenuController = {
  move: (direction: NavigationDirection) => void;
  hover: (index: number | null) => void;
  activate: () => void;
  back: () => void;
  setControlMode: (mode: StarshipInteractionControlMode) => void;
};

const IMAGES = {
  sleep: { card: "/ui/interactions/menu-b/sleep-card.png", scene: "/ui/interactions/menu-b/sleep-scene.jpg" },
  craft: { card: "/ui/interactions/menu-b/craft-card.png", scene: "/ui/interactions/menu-b/craft-scene.jpg" },
  repair: { card: "/ui/interactions/menu-b/repair-card.png", scene: "/ui/interactions/menu-b/repair-scene.jpg" },
  exit: { card: "/ui/interactions/menu-b/exit-card.png", scene: "/ui/interactions/menu-b/exit-card.png" },
} as const;

type ImageStyle = CSSProperties & {
  "--im-option-image"?: string;
  "--im-hero-image"?: string;
  "--im-hero-position"?: string;
};

const optionImageStyle = (url: string): ImageStyle => ({
  "--im-option-image": `url("${url}")`,
});

export const StarshipInteractionMenu = forwardRef<StarshipInteractionMenuController, {
  inputMode: InputMode;
  onInputModeChange: (mode: InputMode) => void;
  onControlModeChange: (mode: StarshipInteractionControlMode) => void;
  onInput: () => void;
  onSleep: (option: StarshipSleepOption) => void;
  onClose: () => void;
}>(function StarshipInteractionMenu({
  inputMode,
  onInputModeChange,
  onControlModeChange,
  onInput,
  onSleep,
  onClose,
}, forwardedRef) {
  const [view, setView] = useState<View>("main");
  const [selected, setSelected] = useState(0);
  const [cursorHover, setCursorHover] = useState<number | null>(null);
  const [controlMode, setControlModeState] = useState<StarshipInteractionControlMode>(
    inputMode === "gamepad" ? "directional" : inputMode === "mobile" ? "touch" : "pointer",
  );
  const panelRef = useRef<HTMLElement>(null);
  const mainSelectionRef = useRef(0);
  const entrySelectionRef = useRef(0);
  const getButtons = useCallback(() => Array.from(
    panelRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [],
  ), []);
  const changeView = useCallback((next: View) => {
    if (next !== "main") {
      mainSelectionRef.current = next === "sleep" ? 0 : next === "craft" ? 1 : 2;
    }
    const nextSelection = next === "main" ? mainSelectionRef.current : 0;
    entrySelectionRef.current = nextSelection;
    setCursorHover(null);
    setSelected(nextSelection);
    setView(next);
  }, []);
  const setControlMode = useCallback((mode: StarshipInteractionControlMode) => {
    setControlModeState(mode);
    onControlModeChange(mode);
    if (mode === "cursor" || mode === "pointer" || mode === "touch") {
      const focused = document.activeElement;
      if (focused instanceof HTMLElement && focused.closest(".starship-interaction-menu")) {
        focused.blur();
      }
    }
  }, [onControlModeChange]);
  const back = useCallback((playSound = true) => {
    if (playSound) onInput();
    if (view === "main") onClose();
    else changeView("main");
  }, [changeView, onClose, onInput, view]);

  const moveLinear = useCallback((offset: number) => {
    const choices = getButtons();
    if (!choices.length) return;
    const focusedIndex = choices.indexOf(document.activeElement as HTMLButtonElement);
    const previous = focusedIndex >= 0 ? focusedIndex : Math.min(selected, choices.length - 1);
    const next = (previous + offset + choices.length) % choices.length;
    setControlMode("directional");
    setSelected(next);
    choices[next]?.focus({ preventScroll: true });
    if (next !== previous) onInput();
  }, [getButtons, onInput, selected, setControlMode]);

  const moveSpatially = useCallback((direction: NavigationDirection) => {
    const choices = getButtons();
    if (choices.length < 2) return;
    const focusedIndex = choices.indexOf(document.activeElement as HTMLButtonElement);
    const currentIndex = focusedIndex >= 0 ? focusedIndex : Math.min(selected, choices.length - 1);
    const currentRect = choices[currentIndex].getBoundingClientRect();
    const origin = { x: currentRect.left + currentRect.width / 2, y: currentRect.top + currentRect.height / 2 };
    const positions = choices.map((choice, index) => {
      const rect = choice.getBoundingClientRect();
      return { choice, index, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }).filter(({ index }) => index !== currentIndex);
    const horizontal = direction === "left" || direction === "right";
    if (horizontal && positions.every(position => Math.abs(position.x - origin.x) <= 4)) return;
    const sign = direction === "right" || direction === "down" ? 1 : -1;
    const candidates = positions.map(position => {
      const primary = (horizontal ? position.x - origin.x : position.y - origin.y) * sign;
      const cross = Math.abs(horizontal ? position.y - origin.y : position.x - origin.x);
      return { ...position, primary, cross };
    }).filter(({ primary }) => primary > 4)
      .sort((a, b) => (a.primary + a.cross * 2.4) - (b.primary + b.cross * 2.4));
    let target = candidates[0];
    if (!target) {
      const edge = direction === "right"
        ? Math.min(...positions.map(position => position.x))
        : direction === "left"
          ? Math.max(...positions.map(position => position.x))
          : direction === "down"
            ? Math.min(...positions.map(position => position.y))
            : Math.max(...positions.map(position => position.y));
      target = positions.map(position => ({
        ...position,
        primary: Math.abs((horizontal ? position.x : position.y) - edge),
        cross: Math.abs(horizontal ? position.y - origin.y : position.x - origin.x),
      })).sort((a, b) => (a.primary + a.cross * 2.4) - (b.primary + b.cross * 2.4))[0];
    }
    if (!target) return;
    setControlMode("directional");
    setSelected(target.index);
    target.choice.focus({ preventScroll: true });
    onInput();
  }, [getButtons, onInput, selected, setControlMode]);

  const activateSelected = useCallback(() => {
    const choices = getButtons();
    const target = choices.includes(document.activeElement as HTMLButtonElement)
      ? document.activeElement as HTMLButtonElement
      : choices[Math.min(selected, choices.length - 1)];
    target?.click();
  }, [getButtons, selected]);

  const hoverFromVirtualCursor = useCallback((index: number | null) => {
    setCursorHover(index);
    if (index === null || index === selected) return;
    setSelected(index);
    onInput();
  }, [onInput, selected]);

  useImperativeHandle(forwardedRef, () => ({
    move: moveSpatially,
    hover: hoverFromVirtualCursor,
    activate: activateSelected,
    back: () => back(),
    setControlMode,
  }), [activateSelected, back, hoverFromVirtualCursor, moveSpatially, setControlMode]);

  useEffect(() => {
    getButtons()[entrySelectionRef.current]?.focus({ preventScroll: true });
  }, [getButtons, view]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      onInputModeChange("keyboard-mouse");
      const directions: Partial<Record<string, NavigationDirection>> = {
        ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down",
      };
      if (directions[event.key]) {
        event.preventDefault();
        event.stopImmediatePropagation();
        moveSpatially(directions[event.key]!);
      } else if (event.key === "Tab") {
        event.preventDefault();
        event.stopImmediatePropagation();
        moveLinear(event.shiftKey ? -1 : 1);
      } else if (event.key === "Enter" || event.code === "Space") {
        event.preventDefault();
        event.stopImmediatePropagation();
        setControlMode("directional");
        activateSelected();
      } else if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        back();
      }
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => {
      window.removeEventListener("keydown", onKeyDown, { capture: true });
    };
  }, [activateSelected, back, getButtons, moveLinear, moveSpatially, onInputModeChange, setControlMode, view]);

  const activate = (action: () => void) => {
    onInput();
    action();
  };

  const row = (index: number, imageUrl: string, title: string, detail: string, action: () => void) => (
    <button
      type="button"
      data-starship-menu-index={index}
      className={`im-row ${(controlMode === "directional" && selected === index) || (controlMode === "cursor" && cursorHover === index) ? "is-selected" : ""}`}
      onFocus={() => setSelected(index)}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") {
          onInputModeChange("keyboard-mouse");
          setControlMode("pointer");
          if (selected !== index) onInput();
        }
        setSelected(index);
        event.currentTarget.focus({ preventScroll: true });
      }}
      onClick={() => activate(action)}
    >
      <span className="im-option-media" style={optionImageStyle(imageUrl)} aria-hidden="true" />
      <span className="im-copy"><strong>{title}</strong><small>{detail}</small></span>
      <span className="im-arrow" aria-hidden="true">›</span>
    </button>
  );
  const heroImage = view === "sleep" ? IMAGES.sleep.scene
    : view === "craft" ? IMAGES.craft.scene
      : view === "repair" ? IMAGES.repair.scene
        : selected === 1 ? IMAGES.craft.scene
          : selected === 2 ? IMAGES.repair.scene
            : selected === 3 ? IMAGES.exit.scene
              : IMAGES.sleep.scene;
  const heroImageStyle: ImageStyle = {
    "--im-hero-image": `url("${heroImage}")`,
    "--im-hero-position": view === "sleep" || (view === "main" && selected === 0)
      ? "center 63%"
      : view === "craft" || (view === "main" && selected === 1)
        ? "center 34%"
        : view === "repair" || (view === "main" && selected === 2)
          ? "center 42%"
          : "center calc(50% + 10px)",
  };
  const mainTitle = selected === 1
    ? "工作甲板"
    : selected === 2
      ? "輪機室"
      : selected === 3
        ? "離開伊薩卡號"
        : "飛船休息艙";
  return (
    <div
      className="im-stage starship-interaction-menu"
      data-input-mode={inputMode}
      data-control-mode={controlMode}
      onPointerDown={(event) => {
        const touch = event.pointerType === "touch";
        onInputModeChange(touch ? "mobile" : "keyboard-mouse");
        setControlMode(touch ? "touch" : "pointer");
      }}
      onPointerMove={(event) => {
        if (event.pointerType === "mouse") {
          onInputModeChange("keyboard-mouse");
          setControlMode("pointer");
        }
      }}
    >
      <div className="im-shade" aria-hidden="true" />
      <section ref={panelRef} className={`im-panel im-view-${view}`} role="dialog" aria-modal="true" aria-labelledby="starship-interaction-title">
        <div className="im-hero">
          <div className="im-hero-media" style={heroImageStyle} aria-hidden="true" />
          <header>
            <div className="im-emblem" aria-hidden="true"><i /><b><span>✦</span></b><i /></div>
            <span className="im-kicker">{view === "sleep" ? "REST & RECOVER" : view === "craft" ? "CRAFTING STATION" : view === "repair" ? "SHIP MAINTENANCE" : "STARSHIP INTERACTION"}</span>
            <h1 id="starship-interaction-title">{view === "sleep" ? "休息與睡眠" : view === "craft" ? "製作道具／食物" : view === "repair" ? "維修飛船" : mainTitle}</h1>
            {view !== "main" ? <p>{view === "sleep" ? "選擇休息時間，為下一段旅程做好準備。" : view === "craft" ? "利用收集到的資源，準備下一次探索。" : "檢查飛船系統與艙體，準備進行維修。"}</p> : null}
          </header>
        </div>
        <div className="im-options">
          {view === "main" ? <>
            {row(0, IMAGES.sleep.card, "睡覺", "恢復狀態 · 選擇休息時間", () => changeView("sleep"))}
            {row(1, IMAGES.craft.card, "製作道具／食物", "加工資源 · 準備探索補給", () => changeView("craft"))}
            {row(2, IMAGES.repair.card, "維修飛船", "修復受損系統與艙體", () => changeView("repair"))}
            <button type="button" data-starship-menu-index={3} className={`im-row im-cancel ${((controlMode === "directional" && selected === 3) || (controlMode === "cursor" && cursorHover === 3)) ? "is-selected" : ""}`} onFocus={() => setSelected(3)} onPointerEnter={(event) => { onInputModeChange(event.pointerType === "touch" ? "mobile" : "keyboard-mouse"); setControlMode(event.pointerType === "touch" ? "touch" : "pointer"); if (event.pointerType === "mouse" && selected !== 3) onInput(); setSelected(3); event.currentTarget.focus({ preventScroll: true }); }} onClick={() => activate(onClose)}>
              <span className="im-option-media" style={optionImageStyle(IMAGES.exit.card)} aria-hidden="true" />
              <span className="im-copy"><strong>取消／返回</strong><small>關閉選單，不執行互動</small></span>
            </button>
          </> : null}
          {view === "sleep" ? <>
            {row(0, IMAGES.sleep.card, "睡滿 8 小時", "從現在起，完整休息八個小時", () => onSleep("eight-hours"))}
            {row(1, IMAGES.sleep.card, "睡到明天 06 點", "休息至明天清晨 06:00", () => onSleep("tomorrow-six"))}
          </> : null}
          {view === "craft" ? <>
            <div className="im-craft-empty"><span aria-hidden="true">⚒</span><h2>製作工作台</h2><p>道具的配方將在這裡顯示。</p><small>配方與製作功能尚未接入</small></div>
            <div className="im-craft-empty"><span aria-hidden="true">♨</span><h2>料理工作台</h2><p>食物與飲品的配方將在這裡顯示。</p><small>配方與料理功能尚未接入</small></div>
          </> : null}
          {view === "repair" ? <div className="im-craft-empty"><span>🔧</span><h2>飛船維修台</h2><p>受損系統與艙體的維修項目將在這裡顯示。</p><small>維修功能尚未接入</small></div> : null}
        </div>
        {view !== "main" ? <button type="button" data-starship-menu-index={view === "sleep" ? 2 : 0} className={`im-back ${((controlMode === "directional" && selected === (view === "sleep" ? 2 : 0)) || (controlMode === "cursor" && cursorHover === (view === "sleep" ? 2 : 0))) ? "is-selected" : ""}`} onFocus={() => setSelected(view === "sleep" ? 2 : 0)} onClick={() => back()}><span>↶</span>返回功能選單</button> : null}
        <footer>{inputMode === "gamepad"
          ? <><span><GamepadButtonIcon button="DPad" /><b className="im-glyph-slash">/</b><GamepadButtonIcon button="LS" />選擇</span><span><GamepadButtonIcon button="A" />確認</span><span><GamepadButtonIcon button="B" />返回</span></>
          : inputMode === "mobile"
            ? <><span>觸控選擇</span><span>點選確認</span><span>點選返回</span></>
            : <><span><kbd>↑ ↓</kbd>選擇</span><span><kbd>ENTER</kbd>確認</span><span><kbd>ESC</kbd>返回</span></>}
        </footer>
      </section>
    </div>
  );
});
