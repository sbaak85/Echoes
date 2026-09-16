"use client";
import { useEffect, useRef, useState } from "react";

export type InteractionIllustration = { enabled: boolean; imagePath: string; withDialogue?: boolean };
export const INTERACTION_ILLUSTRATION_FADE_MS = 500;
type View = { imagePath: string; withDialogue: boolean; closing: boolean };

export function useInteractionIllustration() {
  const [view, setView] = useState<View | null>(null);
  const controller = useRef<{
    view: View | null; timer: ReturnType<typeof setTimeout> | null;
    resolve: ((completed: boolean) => void) | null; done: Promise<boolean>;
  }>({ view: null, timer: null, resolve: null, done: Promise.resolve(true) });
  const api = useRef({
    get isOpen() { return controller.current.view !== null; },
    get withDialogue() { return controller.current.view?.withDialogue === true; },
    open(imagePath: string, withDialogue: boolean) {
      api.current.cancel();
      const state = controller.current;
      state.view = { imagePath, withDialogue, closing: false };
      state.done = new Promise<boolean>(resolve => { state.resolve = resolve; });
      setView(state.view);
      return state.done;
    },
    close() {
      const state = controller.current;
      if (!state.view || state.timer !== null) return state.done;
      state.view = { ...state.view, closing: true };
      setView(state.view);
      state.timer = setTimeout(() => {
        state.timer = null;
        state.view = null;
        setView(null);
        const resolve = state.resolve;
        state.resolve = null;
        resolve?.(true);
      }, INTERACTION_ILLUSTRATION_FADE_MS);
      return state.done;
    },
    cancel() {
      const state = controller.current;
      if (state.timer !== null) clearTimeout(state.timer);
      state.timer = null;
      state.view = null;
      const resolve = state.resolve;
      state.resolve = null;
      resolve?.(false);
      setView(null);
    },
  });
  useEffect(() => () => {
    const state = controller.current;
    if (state.timer !== null) clearTimeout(state.timer);
    state.resolve?.(false);
    state.view = null;
  }, []);
  return { view, controller: api.current };
}

export function InteractionIllustrationOverlay({ view, onClose, onError }: {
  view: View; onClose: () => void; onError: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const overlay = ref.current;
    const shell = overlay?.parentElement;
    if (!overlay || !shell || !view.withDialogue) return;
    const update = () => {
      const dialogue = shell.querySelector(".dialogue-box");
      if (!dialogue) return;
      const bottom = shell.getBoundingClientRect().bottom - dialogue.getBoundingClientRect().top + 16;
      overlay.style.setProperty("--illustration-bottom", `${bottom}px`);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(shell);
    const dialogue = shell.querySelector(".dialogue-box");
    if (dialogue) observer.observe(dialogue);
    const children = new MutationObserver(() => {
      const currentDialogue = shell.querySelector(".dialogue-box");
      if (currentDialogue) observer.observe(currentDialogue);
      update();
    });
    children.observe(shell, { childList: true, subtree: true });
    window.addEventListener("resize", update);
    return () => { children.disconnect(); observer.disconnect(); window.removeEventListener("resize", update); };
  }, [view.withDialogue]);
  return <div ref={ref} className={`interaction-illustration-overlay${view.closing ? " is-closing" : ""}${view.withDialogue ? " is-with-dialogue" : ""}`}
    role={view.withDialogue ? undefined : "dialog"} aria-modal={view.withDialogue ? undefined : true} aria-label="互動插圖"
    onPointerDown={event => event.stopPropagation()}>
    <img src={view.imagePath} alt="互動插圖" draggable={false} onError={onError} />
    {!view.withDialogue && <button type="button" aria-label="關閉互動插圖" onClick={onClose}>關閉</button>}
  </div>;
}
