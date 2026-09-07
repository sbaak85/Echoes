"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { ControllerGlyph } from "./controller-glyph";
import "./preview.css";

type View = "main" | "sleep" | "craft" | "repair" | "closed";
type InputMode = "keyboard-mouse" | "gamepad";
type NavigationDirection = "left" | "right" | "up" | "down";

const B_IMAGES = {
  sleep: {
    card: "/ui/interactions/menu-b/sleep-card.png",
    scene: "/ui/interactions/menu-b/sleep-scene.jpg",
  },
  craft: {
    card: "/ui/interactions/menu-b/craft-card.png",
    scene: "/ui/interactions/menu-b/craft-scene.jpg",
  },
  repair: {
    card: "/ui/interactions/menu-b/repair-card.png",
    scene: "/ui/interactions/menu-b/repair-scene.jpg",
  },
  exit: {
    card: "/ui/interactions/menu-b/exit-card.png",
    scene: "/ui/interactions/menu-b/exit-card.png",
  },
} as const;

type PreviewImageStyle = CSSProperties & {
  "--im-option-image"?: string;
  "--im-hero-image"?: string;
  "--im-hero-position"?: string;
};

const optionImageStyle = (url: string): PreviewImageStyle => ({
  "--im-option-image": `url("${url}")`,
});

export default function InteractionMenuPreview() {
  const [view, setView] = useState<View>("main");
  const [selected, setSelected] = useState(0);
  const [inputMode, setInputMode] = useState<InputMode>("keyboard-mouse");
  const [notice, setNotice] = useState("");
  const panel = useRef<HTMLElement>(null);
  const buttons = () => Array.from(panel.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
  const changeView = (next: View) => { setSelected(0); setView(next); };
  const back = () => changeView(view === "main" ? "closed" : "main");

  useEffect(() => {
    const elements = buttons();
    elements[0]?.focus({ preventScroll: true });
    let frame = 0;
    let priorA = true;
    let priorB = true;
    let priorDirection: NavigationDirection | "" = "";
    let repeatAt = 0;
    const moveLinear = (direction: number) => {
      const choices = buttons();
      const previous = Math.max(0, choices.indexOf(document.activeElement as HTMLButtonElement));
      const next = (previous + direction + choices.length) % choices.length;
      setSelected(next);
      choices[next]?.focus({ preventScroll: true });
    };
    const moveSpatially = (direction: NavigationDirection) => {
      const choices = buttons();
      if (choices.length < 2) return;
      const currentIndex = Math.max(0, choices.indexOf(document.activeElement as HTMLButtonElement));
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
        const primary = ((horizontal ? position.x - origin.x : position.y - origin.y) * sign);
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
        target = positions.map(position => {
          const edgeDistance = Math.abs((horizontal ? position.x : position.y) - edge);
          const cross = Math.abs(horizontal ? position.y - origin.y : position.x - origin.x);
          return { ...position, primary: edgeDistance, cross };
        }).sort((a, b) => (a.primary + a.cross * 2.4) - (b.primary + b.cross * 2.4))[0];
      }
      if (!target) return;
      setSelected(target.index);
      target.choice.focus({ preventScroll: true });
    };
    const key = (event: KeyboardEvent) => {
      setInputMode("keyboard-mouse");
      const arrowDirection: Partial<Record<string, NavigationDirection>> = {
        ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down",
      };
      if (arrowDirection[event.key]) {
        event.preventDefault();
        moveSpatially(arrowDirection[event.key]!);
      } else if (event.key === "Tab") {
        event.preventDefault();
        moveLinear(event.shiftKey ? -1 : 1);
      } else if (event.key === "Escape") {
        event.preventDefault();
        changeView(view === "main" ? "closed" : "main");
      }
    };
    const poll = (time: number) => {
      const pad = navigator.getGamepads?.().find(p => p?.connected);
      if (pad) {
        const axisX = pad.axes[0] ?? 0;
        const axisY = pad.axes[1] ?? 0;
        const direction: NavigationDirection | "" = pad.buttons[14]?.pressed ? "left"
          : pad.buttons[15]?.pressed ? "right"
            : pad.buttons[12]?.pressed ? "up"
              : pad.buttons[13]?.pressed ? "down"
                : Math.abs(axisX) >= Math.abs(axisY) && Math.abs(axisX) > .55 ? (axisX < 0 ? "left" : "right")
                  : Math.abs(axisY) > .55 ? (axisY < 0 ? "up" : "down")
                    : "";
        if (direction && (direction !== priorDirection || time > repeatAt)) {
          moveSpatially(direction);
          repeatAt = time + (direction !== priorDirection ? 380 : 170);
        }
        priorDirection = direction;
        const a = pad.buttons[0]?.pressed ?? false;
        const b = pad.buttons[1]?.pressed ?? false;
        const aPressed = a && !priorA;
        const bPressed = b && !priorB;
        if (direction || aPressed || bPressed) setInputMode("gamepad");
        if (aPressed) (document.activeElement as HTMLButtonElement)?.click();
        if (bPressed) changeView(view === "main" ? "closed" : "main");
        priorA = a; priorB = b;
      }
      frame = requestAnimationFrame(poll);
    };
    const takeMouseControl = () => setInputMode("keyboard-mouse");
    window.addEventListener("keydown", key);
    window.addEventListener("mousemove", takeMouseControl);
    frame = requestAnimationFrame(poll);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("mousemove", takeMouseControl);
      cancelAnimationFrame(frame);
    };
  }, [view]);

  const chooseSleep = (label: string) => {
    setNotice(`已選擇「${label}」 · 排版預覽，尚未執行睡眠`);
    changeView("closed");
  };
  const row = (index: number, imageUrl: string, title: string, detail: string, action: () => void, disabled = false) => (
    <button className={`im-row ${selected === index && !disabled ? "is-selected" : ""}`} disabled={disabled}
      onFocus={() => !disabled && setSelected(index)} onMouseEnter={event => { if (!disabled) { setSelected(index); event.currentTarget.focus({ preventScroll: true }); } }} onClick={action}>
      <span className="im-option-media" style={optionImageStyle(imageUrl)} aria-hidden="true" />
      <span className="im-copy"><strong>{title}</strong><small>{detail}</small></span>
      <span className="im-arrow">{disabled ? "未開放" : <span aria-hidden="true">›</span>}</span>
    </button>
  );
  const heroImage = view === "sleep"
    ? B_IMAGES.sleep.scene
    : view === "craft"
      ? B_IMAGES.craft.scene
      : view === "repair"
        ? B_IMAGES.repair.scene
      : view === "closed"
        ? B_IMAGES.exit.scene
        : selected === 1
          ? B_IMAGES.craft.scene
          : selected === 2
            ? B_IMAGES.repair.scene
            : selected === 3
              ? B_IMAGES.exit.scene
              : B_IMAGES.sleep.scene;
  const heroImageStyle: PreviewImageStyle = {
    "--im-hero-image": `url("${heroImage}")`,
    "--im-hero-position": view === "sleep" || (view === "main" && selected === 0)
      ? "center 63%"
      : view === "craft" || (view === "main" && selected === 1)
        ? "center 34%"
        : view === "repair" || (view === "main" && selected === 2)
          ? "center 42%"
        : view === "closed" || (view === "main" && selected === 3)
          ? "center calc(50% + 10px)"
          : "center",
  };
  return <main className="im-stage" data-input-mode={inputMode}
    onPointerDown={() => setInputMode("keyboard-mouse")}>
    <div className="im-scene" />
    <div className="im-preview-label">互動選單 · B版柔焦圖片預覽</div>
    {view !== "closed" && <div className="im-shade" />}
    <section ref={panel} className={`im-panel im-view-${view}`} role={view === "closed" ? "region" : "dialog"} aria-modal={view === "closed" ? undefined : true} aria-labelledby="im-title">
      <div className="im-hero">
        <div className="im-hero-media" style={heroImageStyle} aria-hidden="true" />
        <header>
          <div className="im-emblem" aria-hidden="true"><i /><b><span>✦</span></b><i /></div>
          <span className="im-kicker">{view === "sleep" ? "REST & RECOVER" : view === "craft" ? "CRAFTING STATION" : view === "repair" ? "SHIP MAINTENANCE" : view === "closed" ? "STARSHIP SHELTER" : "STARSHIP INTERACTION"}</span>
          <h1 id="im-title">{view === "sleep" ? "休息與睡眠" : view === "craft" ? "製作道具／食物" : view === "repair" ? "維修飛船" : view === "closed" ? "已返回飛船" : "飛船休息艙"}</h1>
          {view !== "main" && (
            <p>{view === "sleep" ? "選擇休息時間，為下一段旅程做好準備。" : view === "craft" ? "利用收集到的資源，準備下一次探索。" : view === "repair" ? "檢查飛船系統與艙體，準備進行維修。" : notice || "你可以繼續探索，或再次開啟功能選單。"}</p>
          )}
        </header>
      </div>
      <div className="im-options">
        {view === "main" && <>
          {row(0, B_IMAGES.sleep.card, "睡覺", "恢復狀態 · 選擇休息時間", () => changeView("sleep"))}
          {row(1, B_IMAGES.craft.card, "製作道具／食物", "加工資源 · 準備探索補給", () => changeView("craft"))}
          {row(2, B_IMAGES.repair.card, "維修飛船", "修復受損系統與艙體", () => changeView("repair"))}
          <button className={`im-row im-cancel ${selected === 3 ? "is-selected" : ""}`}
            onFocus={() => setSelected(3)} onMouseEnter={event => { setSelected(3); event.currentTarget.focus({ preventScroll: true }); }} onClick={back}>
            <span className="im-option-media" style={optionImageStyle(B_IMAGES.exit.card)} aria-hidden="true" />
            <span className="im-copy"><strong>取消／返回</strong><small>關閉選單，不執行互動</small></span>
          </button>
        </>}
        {view === "sleep" && <>{row(0, B_IMAGES.sleep.card, "睡滿 8 小時", "從現在起，完整休息八個小時", () => chooseSleep("睡滿8小時"))}{row(1, B_IMAGES.sleep.card, "睡到明天 06 點", "休息至明天清晨 06:00", () => chooseSleep("睡到明天06點"))}</>}
        {view === "craft" && <div className="im-craft-empty"><span>⚒</span><h2>製作工作台</h2><p>道具與食物的配方將在這裡顯示。</p><small>介面預覽 · 配方與製作功能尚未接入</small></div>}
        {view === "repair" && <div className="im-craft-empty"><span>🔧</span><h2>飛船維修台</h2><p>受損系統與艙體的維修項目將在這裡顯示。</p><small>介面預覽 · 維修功能尚未接入</small></div>}
        {view === "closed" && row(0, B_IMAGES.exit.card, "開啟功能選單", "返回飛船休息艙", () => { setNotice(""); changeView("main"); })}
      </div>
      {view !== "closed" && view !== "main" && <button className={`im-back ${selected === (view === "sleep" ? 2 : 0) ? "is-selected" : ""}`} onFocus={() => setSelected(view === "sleep" ? 2 : 0)} onClick={back}><span>↶</span>返回功能選單</button>}
      <footer>{inputMode === "gamepad"
        ? <><span><ControllerGlyph button="DPAD" /><b className="im-glyph-slash">/</b><ControllerGlyph button="LS" />選擇</span><span><ControllerGlyph button="A" />確認</span><span><ControllerGlyph button="B" />返回</span></>
        : <><span><kbd>↑ ↓</kbd>選擇</span><span><kbd>ENTER</kbd>確認</span><span><kbd>ESC</kbd>返回</span></>}
      </footer>
    </section>
  </main>;
}
