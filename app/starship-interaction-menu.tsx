"use client";
import type { CraftingAudioEvent } from "./crafting-completion-timing";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type SyntheticEvent,
} from "react";
import { GamepadButtonIcon } from "./gamepad-button-icon";
import { CraftingWorkbench } from "./crafting-workbench";
import type { PlayerInventory } from "./item-database";
import { STARSHIP_CRAFTING_TUTORIAL_STEPS, STARSHIP_CRAFTING_TUTORIAL_RECIPE, advanceStarshipCraftingTutorial, starshipTutorialButtonSelectors, type StarshipCraftingTutorialStep } from "./starship-crafting-tutorial";
import { StarshipCraftingTutorialOverlay } from "./starship-crafting-tutorial-overlay";
import { LOCKED_STARSHIP_MENU_FEATURES, type StarshipMenuFeatureLocks } from "./starship-menu-availability";
import "./starship-interaction-menu.css";
import { resolveRuntimePublicAssetUrl as assetUrl } from "./public-asset-url";

type View = "main" | "sleep" | "craft" | "repair" | "workbench" | "cooking";
type InputMode = "keyboard-mouse" | "gamepad" | "mobile";
type NavigationDirection = "left" | "right" | "up" | "down";
export type StarshipSleepOption = "eight-hours" | "tomorrow-six";
export type StarshipInteractionControlMode = "pointer" | "directional" | "cursor" | "touch";
export type StarshipInteractionMenuController = {
  isTutorialActive?: () => boolean;
  activatePointerTarget?: (element: Element | null) => boolean;
  updateTriggers?: (left: boolean, right: boolean, now: number) => boolean;
  switchColumn?: (delta: number) => void;
  changePage?: (delta: number) => void;
  secondary?: () => void;
  inspect?: () => void;
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
  inventory: PlayerInventory;
  onCraftAudio?: (event: CraftingAudioEvent) => void;
  onWorkbenchHoverAudio?: (event: "workbenchToolHover" | "workbenchCookingHover" | null) => void;
  onWorkbenchOpenAudio?: (event: "workbenchToolOpen" | "workbenchCookingOpen") => void;
  onCraft: (recipeId: string, quantity?: number) => { ok: boolean; reason?: string };
  tutorialStart?: boolean;
  featureLocks?: StarshipMenuFeatureLocks;
  onTutorialCompleted?: () => void;
}>(function StarshipInteractionMenu({
  inputMode,
  onInputModeChange,
  onControlModeChange,
  onInput,
  onSleep,
  onClose,
  inventory,
  onCraft,
  onCraftAudio,
  onWorkbenchHoverAudio,
  onWorkbenchOpenAudio,
  tutorialStart = false,
  featureLocks = LOCKED_STARSHIP_MENU_FEATURES,
  onTutorialCompleted,
}, forwardedRef) {
  const tutorialRoot = useRef<HTMLDivElement>(null);
  const featureLocksRef = useRef(featureLocks); featureLocksRef.current = featureLocks;
  const isFeatureLocked = useCallback((feature?: string) =>
    (feature === "cooking" && featureLocksRef.current.cooking) ||
    (feature === "repair" && featureLocksRef.current.repair), []);
  const isButtonAvailable = useCallback((button: HTMLButtonElement | null) => !!button &&
    !button.disabled && !isFeatureLocked(button.dataset.tutorialAction), [isFeatureLocked]);
  const [tutorialStep, setTutorialStep] = useState<StarshipCraftingTutorialStep | null>(() => tutorialStart ? STARSHIP_CRAFTING_TUTORIAL_STEPS[0] : null);
  const [tutorialReady, setTutorialReady] = useState(false);
  const [tutorialAnimationPlaying, setTutorialAnimationPlaying] = useState(false);
  const tutorialRuntime = useRef({ step: tutorialStep, ready: false });
  const tutorialTarget = useCallback(() => tutorialRuntime.current.step
    ? tutorialRoot.current?.querySelector<HTMLButtonElement>(tutorialRuntime.current.step.focusTarget ?? tutorialRuntime.current.step.target) ?? null : null, []);
  const tutorialAllows = useCallback((button: Element | null) => !tutorialRuntime.current.step ||
    (tutorialRuntime.current.ready && button !== null && !!tutorialRoot.current?.contains(button) &&
      starshipTutorialButtonSelectors(tutorialRuntime.current.step).some(selector => button.matches(selector))), []);
  const interruptTutorial = () => {
    tutorialRuntime.current.step = null; tutorialRuntime.current.ready = false;
    setTutorialReady(false); setTutorialStep(null);
  };
  const advanceTutorial = (action: string) => {
    const state = tutorialRuntime.current;
    if (!state.step || !state.ready || state.step.action !== action) return;
    const next = advanceStarshipCraftingTutorial(state.step, action);
    state.step = next; state.ready = false;
    setTutorialReady(false); setTutorialStep(next);
    if (!next) onTutorialCompleted?.();
  };
  const gateMenuEvent = (event: SyntheticEvent) => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("button") : null;
    if ((button && !isButtonAvailable(button)) || !tutorialAllows(button)) {
      event.preventDefault(); event.stopPropagation();
    }
  };
  const blockTutorialEvent = (event: SyntheticEvent) => {
    if (tutorialRuntime.current.step) { event.preventDefault(); event.stopPropagation(); }
  };
  const [view, setView] = useState<View>("main");
  const [selected, setSelected] = useState(0);
  const [cursorHover, setCursorHover] = useState<number | null>(null);
  const [pointerHover, setPointerHover] = useState<number | null>(null);
  const hoverAudioRef = useRef(onWorkbenchHoverAudio);
  hoverAudioRef.current = onWorkbenchHoverAudio;
  const openAudioRef = useRef(onWorkbenchOpenAudio);
  openAudioRef.current = onWorkbenchOpenAudio;
  useEffect(() => {
    if (view === "workbench") openAudioRef.current?.("workbenchToolOpen");
    else if (view === "cooking") openAudioRef.current?.("workbenchCookingOpen");
  }, [view]);
  const [controlMode, setControlModeState] = useState<StarshipInteractionControlMode>(
    inputMode === "gamepad" ? "directional" : inputMode === "mobile" ? "touch" : "pointer",
  );
  const panelRef = useRef<HTMLElement>(null);
  const workbenchRef = useRef<StarshipInteractionMenuController>(null);
  const mainSelectionRef = useRef(0);
  const entrySelectionRef = useRef(0);
  const craftSelectionRef = useRef(0);
  const activeWorkbench = view !== "craft" ? null
    : controlMode === "directional" ? selected
    : controlMode === "cursor" ? cursorHover
    : controlMode === "pointer" ? pointerHover : null;
  const hoverEvent = activeWorkbench === 0 ? "workbenchToolHover"
    : activeWorkbench === 1 && !featureLocks.cooking ? "workbenchCookingHover" : null;
  useEffect(() => {
    hoverAudioRef.current?.(hoverEvent);
  }, [hoverEvent]);
  useEffect(() => () => { hoverAudioRef.current?.(null); }, []);
  useEffect(() => {
    const hovered = panelRef.current?.querySelector<HTMLElement>(".im-row:not([data-feature-locked=true]):hover");
    setPointerHover(hovered ? Number(hovered.dataset.starshipMenuIndex) : null);
  }, [view]);
  const getButtons = useCallback(() => Array.from(
    panelRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [],
  ).filter(isButtonAvailable), [isButtonAvailable]);
  const changeView = useCallback((next: View) => {
    if (isFeatureLocked(next)) return;
    if (next !== "main") {
      mainSelectionRef.current = next === "sleep" ? 0 : next === "craft" || next === "workbench" || next === "cooking" ? 1 : 2;
    }
    if (next === "workbench" || next === "cooking") craftSelectionRef.current = next === "cooking" ? 1 : 0;
    const rememberedSelection = next === "main" ? mainSelectionRef.current : next === "craft" ? craftSelectionRef.current : 0;
    const nextSelection = (next === "main" && rememberedSelection === 2 && isFeatureLocked("repair")) ||
      (next === "craft" && rememberedSelection === 1 && isFeatureLocked("cooking")) ? 0 : rememberedSelection;
    entrySelectionRef.current = nextSelection;
    setCursorHover(null);
    setPointerHover(null);
    setSelected(nextSelection);
    setView(next);
  }, [isFeatureLocked]);
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
    if (tutorialRuntime.current.step) return;
    if (playSound) onInput();
    if (view === "main") onClose();
    else changeView("main");
  }, [changeView, onClose, onInput, view]);

  const moveLinear = useCallback((offset: number) => {
    if (tutorialRuntime.current.step) { setControlMode("directional"); if (tutorialRuntime.current.ready) tutorialTarget()?.focus({ preventScroll: true }); return; }
    const choices = getButtons();
    if (!choices.length) return;
    const focusedIndex = choices.indexOf(document.activeElement as HTMLButtonElement);
    const selectedIndex = choices.findIndex(button => Number(button.dataset.starshipMenuIndex) === selected);
    const previous = focusedIndex >= 0 ? focusedIndex : Math.max(0, selectedIndex);
    const next = (previous + offset + choices.length) % choices.length;
    setControlMode("directional");
    setSelected(Number(choices[next].dataset.starshipMenuIndex));
    choices[next]?.focus({ preventScroll: true });
    if (next !== previous) onInput();
  }, [getButtons, onInput, selected, setControlMode, tutorialTarget]);

  const moveSpatially = useCallback((direction: NavigationDirection) => {
    if (tutorialRuntime.current.step) { setControlMode("directional"); if (tutorialRuntime.current.ready) tutorialTarget()?.focus({ preventScroll: true }); return; }
    const choices = getButtons();
    if (choices.length < 2) return;
    const focusedIndex = choices.indexOf(document.activeElement as HTMLButtonElement);
    const selectedIndex = choices.findIndex(button => Number(button.dataset.starshipMenuIndex) === selected);
    const currentIndex = focusedIndex >= 0 ? focusedIndex : Math.max(0, selectedIndex);
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
    setSelected(Number(target.choice.dataset.starshipMenuIndex));
    target.choice.focus({ preventScroll: true });
    onInput();
  }, [getButtons, onInput, selected, setControlMode, tutorialTarget]);

  const activateSelected = useCallback(() => {
    if (tutorialRuntime.current.step) { if (tutorialRuntime.current.ready) tutorialTarget()?.click(); return; }
    const choices = getButtons();
    if (controlMode === "cursor") {
      choices.find(button => Number(button.dataset.starshipMenuIndex) === cursorHover)?.click();
      return;
    }
    const target = choices.includes(document.activeElement as HTMLButtonElement)
      ? document.activeElement as HTMLButtonElement
      : choices.find(button => Number(button.dataset.starshipMenuIndex) === selected) ?? choices[0];
    target?.click();
  }, [controlMode, cursorHover, getButtons, selected, tutorialTarget]);

  const hoverFromVirtualCursor = useCallback((index: number | null) => {
    const button = getButtons().find(button => Number(button.dataset.starshipMenuIndex) === index) ?? null;
    if (!button || !tutorialAllows(button)) { setCursorHover(null); return; }
    setCursorHover(index);
    if (index === null || index === selected) return;
    setSelected(index);
    onInput();
  }, [getButtons, onInput, selected, tutorialAllows]);

  useImperativeHandle(forwardedRef, () => ({
    isTutorialActive: () => !!tutorialRuntime.current.step,
    activatePointerTarget: element => {
      const button = element?.closest<HTMLButtonElement>("button:not(:disabled)") ?? null;
      if (!button || !isButtonAvailable(button) || !tutorialRoot.current?.contains(button) || !tutorialAllows(button)) return false;
      button.click(); return true;
    },
    updateTriggers: (left, right, now) => {
      // Poll blocked steps too, so a held trigger must rearm at neutral before STEP7.
      const owned = workbenchRef.current?.updateTriggers?.(left, right, now) ?? false;
      return tutorialRuntime.current.step ? true : owned;
    },
    switchColumn: delta => { if (!tutorialRuntime.current.step) workbenchRef.current?.switchColumn?.(delta); },
    changePage: delta => { if (!tutorialRuntime.current.step) workbenchRef.current?.changePage?.(delta); },
    secondary: () => { if (!tutorialRuntime.current.step) workbenchRef.current?.secondary?.(); else if (tutorialRuntime.current.step.id === "auto-fill" && tutorialRuntime.current.ready) tutorialTarget()?.click(); },
    inspect: () => { if (!tutorialRuntime.current.step) workbenchRef.current?.inspect?.(); },
    move: direction => {
      if (tutorialRuntime.current.step) {
        if (tutorialRuntime.current.step.id === "quantity") { workbenchRef.current?.move(direction); return; }
        if (view === "workbench") workbenchRef.current?.setControlMode("directional"); else setControlMode("directional");
        if (tutorialRuntime.current.ready) tutorialTarget()?.focus({ preventScroll: true });
      } else if (view === "workbench" || view === "cooking") workbenchRef.current?.move(direction); else moveSpatially(direction);
    },
    hover: index => {
      if (tutorialRuntime.current.step) {
        const buttons = Array.from(tutorialRoot.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
        if (!tutorialAllows(index === null ? null : buttons.find(button => Number(button.dataset.starshipMenuIndex) === index) ?? null)) index = null;
      }
      if (view === "workbench" || view === "cooking") workbenchRef.current?.hover(index); else hoverFromVirtualCursor(index);
    },
    activate: () => {
      if (tutorialRuntime.current.step) {
        if (tutorialRuntime.current.ready) {
          if (view === "workbench") workbenchRef.current?.activate(); else tutorialTarget()?.click();
        }
      }
      else if (view === "workbench" || view === "cooking") workbenchRef.current?.activate(); else activateSelected();
    },
    back: () => { if (tutorialRuntime.current.step) return; if (view === "workbench" || view === "cooking") workbenchRef.current?.back(); else back(); },
    setControlMode: mode => (view === "workbench" || view === "cooking") ? workbenchRef.current?.setControlMode(mode) : setControlMode(mode),
  }), [activateSelected, back, hoverFromVirtualCursor, moveSpatially, setControlMode, view, tutorialAllows, tutorialTarget, isButtonAvailable]);

  useEffect(() => {
    const buttons = getButtons();
    (buttons.find(button => Number(button.dataset.starshipMenuIndex) === entrySelectionRef.current) ?? buttons[0])?.focus({ preventScroll: true });
  }, [getButtons, view]);

  useEffect(() => {
    // Reconcile a live quest change without retaining a newly locked view/target.
    if (isFeatureLocked(view)) { changeView(view === "cooking" ? "craft" : "main"); return; }
    const buttons = getButtons();
    const hasIndex = (index: number | null) => index !== null && buttons.some(button => Number(button.dataset.starshipMenuIndex) === index);
    setCursorHover(current => hasIndex(current) ? current : null);
    setPointerHover(current => hasIndex(current) ? current : null);
    if (!hasIndex(selected) && buttons[0]) {
      setSelected(Number(buttons[0].dataset.starshipMenuIndex));
      if (controlMode === "directional") buttons[0].focus({ preventScroll: true });
    }
  }, [featureLocks.cooking, featureLocks.repair, view, selected, controlMode, changeView, getButtons, isFeatureLocked]);

  useEffect(() => {
    if ((view === "workbench" || view === "cooking")) return;
    const onKeyDown = (event: KeyboardEvent) => {
      onInputModeChange("keyboard-mouse");
      if (tutorialRuntime.current.step) {
        event.preventDefault(); event.stopImmediatePropagation();
        if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Tab", "Enter", " "].includes(event.key)) {
          setControlMode("directional");
          if (tutorialRuntime.current.ready) tutorialTarget()?.focus({ preventScroll: true });
          if (!event.repeat && (event.key === "Enter" || event.code === "Space")) activateSelected();
        }
        return;
      }
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
        if (!event.repeat) activateSelected();
      } else if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!event.repeat) back();
      }
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => {
      window.removeEventListener("keydown", onKeyDown, { capture: true });
    };
  }, [activateSelected, back, getButtons, moveLinear, moveSpatially, onInputModeChange, setControlMode, view, tutorialTarget]);

  const activate = (action: () => void) => {
    onInput();
    action();
  };

  const row = (index: number, imageUrl: string, title: string, detail: string, action: () => void, tutorialAction?: string) => {
    const locked = isFeatureLocked(tutorialAction);
    return (
    <button
      type="button"
      data-starship-menu-index={index}
      data-tutorial-action={tutorialAction}
      data-feature-locked={locked || undefined}
      tabIndex={locked ? -1 : undefined}
      aria-disabled={locked || (tutorialStep && (!tutorialReady || tutorialStep.action !== tutorialAction)) ? true : undefined}
      className={`im-row${locked ? " is-feature-locked" : ""} ${!locked && ((controlMode === "directional" && selected === index) || (controlMode === "cursor" && cursorHover === index)) ? "is-selected" : ""}`}
      onFocus={(event) => { if (isFeatureLocked(tutorialAction)) { event.currentTarget.blur(); return; } setSelected(index); }}
      onPointerEnter={(event) => {
        if (isFeatureLocked(tutorialAction)) { setPointerHover(null); return; }
        if (event.pointerType === "mouse") {
          setPointerHover(index);
          onInputModeChange("keyboard-mouse");
          setControlMode("pointer");
          if (selected !== index) onInput();
        }
        setSelected(index);
        event.currentTarget.focus({ preventScroll: true });
      }}
      onPointerLeave={() => setPointerHover(null)}
      onClick={(event) => { if (!isButtonAvailable(event.currentTarget) || !tutorialAllows(event.currentTarget)) return; activate(action); if (tutorialAction) advanceTutorial(tutorialAction); }}
    >
      {view === "craft" && <span className="im-workbench-hover-fx" aria-hidden="true">
        <span className="im-workbench-fx-disc">
          <span className="im-workbench-fx-rays" />
          <svg viewBox="0 0 560 560" focusable="false">
            <g className="im-workbench-fx-scaffold" opacity=".24">
              {[200,216,232].map(radius=><circle key={radius} cx="280" cy="280" r={radius}/>) }
            </g>
            <g className="im-workbench-fx-orbit">
              {Array.from({length:72},(_,i)=><path key={i}
                d={i%6===0?"M280 48V64":"M280 48V55"}
                transform={`rotate(${i*5} 280 280)`}
                opacity={i%6===0?.7:.32}/>) }
            </g>
            <g className="im-workbench-fx-outer">
              {Array.from({length:36},(_,i)=><path key={i} d="M280 80V84"
                transform={`rotate(${i*10} 280 280)`}/>) }
            </g>
          </svg>
        </span>
      </span>}
      <span className="im-option-media" style={optionImageStyle(imageUrl)} aria-hidden="true" />
      <span className="im-copy"><strong>{title}</strong><small>{detail}</small></span>
      <span className="im-arrow" aria-hidden="true">›</span>
    </button>
    );
  };
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
  const content = (view === "workbench" || view === "cooking") ? <CraftingWorkbench key={view} mode={view === "cooking" ? "cooking" : "craft"} ref={workbenchRef}
    inventory={inventory} inputMode={inputMode} controlMode={controlMode}
    tutorial={tutorialStep ? { recipeId: STARSHIP_CRAFTING_TUTORIAL_RECIPE, step: tutorialStep, ready: tutorialReady } : undefined}
    onRecipeSelected={id => advanceTutorial(`recipe:${id}`)}
    onTutorialAction={advanceTutorial} onTutorialInterrupted={interruptTutorial}
    onCraftingAnimationChange={setTutorialAnimationPlaying}
    onControlModeChange={setControlMode} onInputModeChange={onInputModeChange}
    onInput={onInput} onCraftAudio={onCraftAudio} onCraft={onCraft} onBack={() => changeView("craft")} /> : (
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
          const row = (event.target as Element).closest<HTMLElement>(".im-row[data-starship-menu-index]:not([data-feature-locked=true])");
          setPointerHover(row ? Number(row.dataset.starshipMenuIndex) : null);
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
            {row(1, IMAGES.craft.card, "製作道具／食物", "加工資源 · 準備探索補給", () => changeView("craft"), "craft")}
            {row(2, IMAGES.repair.card, "維修飛船", "修復受損系統與艙體", () => changeView("repair"), "repair")}
            <button type="button" data-starship-menu-index={3} aria-disabled={tutorialStep ? true : undefined} className={`im-row im-cancel ${((controlMode === "directional" && selected === 3) || (controlMode === "cursor" && cursorHover === 3)) ? "is-selected" : ""}`} onFocus={() => setSelected(3)} onPointerEnter={(event) => { onInputModeChange(event.pointerType === "touch" ? "mobile" : "keyboard-mouse"); setControlMode(event.pointerType === "touch" ? "touch" : "pointer"); if (event.pointerType === "mouse" && selected !== 3) onInput(); setSelected(3); event.currentTarget.focus({ preventScroll: true }); }} onClick={() => activate(onClose)}>
              <span className="im-option-media" style={optionImageStyle(IMAGES.exit.card)} aria-hidden="true" />
              <span className="im-copy"><strong>取消／返回</strong><small>關閉選單，不執行互動</small></span>
            </button>
          </> : null}
          {view === "sleep" ? <>
            {row(0, IMAGES.sleep.card, "睡滿 8 小時", "從現在起，完整休息八個小時", () => onSleep("eight-hours"))}
            {row(1, IMAGES.sleep.card, "睡到明天 06 點", "休息至明天清晨 06:00", () => onSleep("tomorrow-six"))}
          </> : null}
          {view === "craft" ? <>
            {row(0, assetUrl("ui/power-devices/工作台5-去背.png"), "製作工作台", "選擇配方、投入素材，製作道具與補給。", () => changeView("workbench"), "workbench")}
            {row(1, assetUrl("ui/power-devices/料理台5-去背.png"), "料理工作台", "選擇食物配方、投入食材，製作料理與飲品。", () => changeView("cooking"), "cooking")}
          </> : null}
          {view === "repair" ? <div className="im-craft-empty"><span>🔧</span><h2>飛船維修台</h2><p>受損系統與艙體的維修項目將在這裡顯示。</p><small>維修功能尚未接入</small></div> : null}
        </div>
        {view !== "main" ? <button type="button" aria-disabled={tutorialStep ? true : undefined} data-starship-menu-index={view === "sleep" ? 2 : view === "craft" ? 2 : 0} className={`im-back ${((controlMode === "directional" && selected === (view === "sleep" ? 2 : view === "craft" ? 2 : 0)) || (controlMode === "cursor" && cursorHover === (view === "sleep" ? 2 : view === "craft" ? 2 : 0))) ? "is-selected" : ""}`} onFocus={() => setSelected(view === "sleep" ? 2 : view === "craft" ? 2 : 0)} onClick={() => back()}><span>↶</span>返回功能選單</button> : null}
        <footer>{!tutorialStep && (inputMode === "gamepad"
          ? <><span><GamepadButtonIcon button="DPad" /><b className="im-glyph-slash">/</b><GamepadButtonIcon button="LS" />選擇</span><span><GamepadButtonIcon button="A" />確認</span><span><GamepadButtonIcon button="B" />返回</span></>
          : inputMode === "mobile"
            ? <><span>觸控選擇</span><span>點選確認</span><span>點選返回</span></>
            : <><span><kbd>↑ ↓</kbd>選擇</span><span><kbd>ENTER</kbd>確認</span><span><kbd>ESC</kbd>返回</span></>)}
        </footer>
      </section>
    </div>
  );
  return <div ref={tutorialRoot} className="starship-tutorial-host" data-tutorial-active={!!tutorialStep}
    data-tutorial-step={tutorialStep?.order ?? "none"}
    onClickCapture={gateMenuEvent} onPointerDownCapture={gateMenuEvent} onPointerUpCapture={gateMenuEvent}
    onPointerOverCapture={gateMenuEvent} onPointerMoveCapture={gateMenuEvent}
    onWheelCapture={blockTutorialEvent} onContextMenuCapture={blockTutorialEvent}>
    {content}
    {tutorialStep && !tutorialAnimationPlaying ? <StarshipCraftingTutorialOverlay key={tutorialStep.id} step={tutorialStep} root={tutorialRoot} inputMode={inputMode}
      onReady={id => {
        if (tutorialRuntime.current.step?.id !== id) return;
        tutorialRuntime.current.ready = true; setTutorialReady(true);
        if (controlMode === "directional") tutorialTarget()?.focus({ preventScroll: true });
      }}
      onUnavailable={id => {
        if (tutorialRuntime.current.step?.id !== id) return;
        tutorialRuntime.current.step = null; tutorialRuntime.current.ready = false;
        setTutorialStep(null); setTutorialReady(false);
        console.warn(`Ship tutorial target unavailable: ${id}; input lock released without marking completion.`);
      }} /> : null}
  </div>;
});
