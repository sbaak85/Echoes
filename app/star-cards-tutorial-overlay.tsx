"use client";

import { useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type RefObject } from "react";
import { createPortal } from "react-dom";
import { GamepadButtonIcon } from "./gamepad-button-icon";
import { cursorOwnership } from "./cursor-ownership";
import { resolveRuntimePublicAssetUrl } from "./public-asset-url";
import { STARSHIP_CRAFTING_TUTORIAL_VISUALS } from "./starship-crafting-tutorial";
// Reuse the accepted game Tips artwork rather than introducing a card-game skin.
import "./starship-crafting-tutorial.css";
import "./star-cards-tutorial.css";

export type StarCardsTutorialStage = "initial" | "draw" | "place" | "battle" | "counter" | "score" | "points" | "choice" | "known" | "risk" | "recap" | "encourage";
type Rect = { x: number; y: number; width: number; height: number };
type Selectors = { hand: string; zones: string; zone2: string; draw: string; battle: string };
type Placement = {
  holes: Rect[];
  board: Rect;
  tip: Rect & { arrowDirection: "up" | "down" };
  viewport: { width: number; height: number };
};

export const STAR_CARDS_TUTORIAL_MESSAGES: Record<StarCardsTutorialStage, string> = {
  initial: "「星際牌」為根據相生相剋的艦艇 (屬性)，\n互相比較點數大小為勝負依據的卡牌遊戲。\n起手時將 3張卡牌自由拖曳到 3個戰區 (ZONE) 格子中，\n現在先將 3張卡牌分別拖曳至 ZONE 1、2、3。",
  draw: "雙方佈局完成後會將 6張卡牌全部翻開，\n此時還不會開戰，下一回合將以此陣型展開對決。\n接著按下「DRAW」雙方再抽一張牌。",
  place: "每一格戰區最多可堆疊「3張牌」，\n對戰時以最上層的牌為計算依據，\n先將【雷射艦 (2)】放置到 ZONE 2。",
  battle: "放置完成的該次回合會暫時蓋牌，\n按下「BATTLE」後才正式開始對戰。",
  counter: "「星際牌」共有 3種艦艇彼此相剋，\n【護盾艦】>【雷射艦】>【飛彈艦】，\n此回合【雷射艦 (2)】勝【飛彈艦 (3)】，\n故我方雷射艦將擊毀對方飛彈艦。",
  score: "透過【雷射艦 (2)】擊毀對手的卡牌【飛彈艦 (3)】\n該回合對決中我方可獲得「3分」；每一回合所有\n戰區最上層的卡牌皆會一次計算勝負得分點。",
  points: "若艦艇同屬性則依點數判定勝負，\n【飛彈艦 (2)】勝【飛彈艦 (1)】，\n【護盾艦 (3)】平手【護盾艦 (3)】。",
  choice: "只要戰區未疊滿上限 3張，可將該回合\n抽出的新卡牌決定配置到任何一格戰區。\n但依據船艦相剋的規則 : ",
  known: "放置在 ZONE 1 >【飛彈艦 (2)】平手【飛彈艦 (2)】\n放置在 ZONE 2 >【飛彈艦 (2)】負於【雷射艦 (2)】；",
  risk: "冒險放置在ZONE 3，則可用我方【飛彈艦 (2)】\n去猜測對手可能翻出負於我方的卡牌。\n現在將手牌拖曳至 ZONE 3。",
  recap: "此回合成功猜對我方【飛彈艦 (2)】\n勝過對手的【護盾艦 (2)】獲得了 2分。\n每局遊戲中玩家各自發完9張手牌後結算分數，\n高分者該局勝利，先贏得5戰3勝為最後獲勝者。",
  encourage: "現在運用策略，思考佈陣，\n親自嘗試去贏下這局勝利吧。",
};

const STEP_LABELS: Record<StarCardsTutorialStage, string> = {
  initial: "1/12", draw: "2/12", place: "3/12", battle: "4/12", counter: "5/12", score: "6/12", points: "7/12", choice: "8/12", known: "9/12", risk: "10/12", recap: "11/12", encourage: "12/12",
};
// CSS-pixel sizes of the annotated frames at the current text/font baseline.
// Text changes adjust these widths; they are not fixed minimum dimensions.
const TIP_DEFAULT_WIDTHS: Record<StarCardsTutorialStage, number> = {
  initial: 440, draw: 340, place: 350, battle: 340, counter: 330, score: 406, points: 350,
  choice: 500, known: 460, risk: 420, recap: 430, encourage: 330,
};
// Keep the approved sizing reference independent of editable/localized copy.
const TIP_WIDTH_REFERENCE: Partial<Record<StarCardsTutorialStage, string>> = {
  initial: "「星際牌」為根據相生相剋的艦艇(屬性)，\n與互比點數大小為勝負依據的卡牌遊戲。\n將【飛1】【雷1】【盾3】分別拖曳至 ZONE 1、2、3。",
  draw: "佈局完成後初始回合還不會開戰，\n接著按下「DRAW」雙方再抽一張牌。",
  place: "每一格戰區最多可堆疊3張牌，\n對戰時以最上層的牌為計算依據，\n先將「飛彈艦 <2點>」放置到ZONE 2",
  battle: "放置完成的當局會暫時蓋牌，\n按下「BATTLE」後才正式開始對戰。",
  counter: "「星際牌」共有3種艦艇彼此相剋，\n【護盾艦】>【雷射艦】>【飛彈艦】，\n此回合【雷射艦】剋【飛彈艦】，\n故我方雷射艦擊毀對方飛彈艦",
  score: "透過【雷射艦 (2)】擊毀對手的卡牌【飛彈艦 (3)】\n該回合對決中我方可獲得「3分」；每一回合所有\n戰區最上層的卡牌皆會一次計算勝負得分點。",
  points: "同屬性艦艇對戰為依點數判定，\n【飛彈艦<2>】勝【飛彈艦<1>】，\n【護盾艦<3>】平手【護盾艦<3>】",
  choice: "只要戰區未疊滿上限 3張，可將該回合DRAW出的新卡牌，\n決定配置到任何一格戰區。但依據船艦相剋的規則 : ",
  known: "放置在 ZONE 1 >【飛彈艦 (2)】平手【飛彈艦 (2)】\n放置在 ZONE 2 >【飛彈艦 (2)】負於【雷射艦 (2)】；",
  risk: "冒險放置在ZONE 3，則可用我方【飛彈艦 (2)】\n去猜測對手可能翻出負於我方的卡牌。",
};
TIP_WIDTH_REFERENCE.recap = STAR_CARDS_TUTORIAL_MESSAGES.recap;
TIP_WIDTH_REFERENCE.encourage = STAR_CARDS_TUTORIAL_MESSAGES.encourage;
const DEFAULT_SELECTORS: Selectors = {
  hand: ".star-card-shell.is-hand",
  zones: ".star-cards-lane.is-player-lane",
  zone2: '.star-cards-lane.is-player-lane[data-lane="B"]',
  draw: ".star-cards-image-button.is-draw",
  battle: ".star-cards-image-button.is-battle",
};

const union = (rects: readonly Rect[]): Rect | null => {
  if (!rects.length) return null;
  const x = Math.min(...rects.map(rect => rect.x));
  const y = Math.min(...rects.map(rect => rect.y));
  return {
    x, y,
    width: Math.max(...rects.map(rect => rect.x + rect.width)) - x,
    height: Math.max(...rects.map(rect => rect.y + rect.height)) - y,
  };
};
const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(Math.max(minimum, maximum), value));
const subscribeToCursorOwner = (listener: () => void) => cursorOwnership.subscribe(listener);
const getCursorOwner = () => cursorOwnership.owner;
const getServerCursorOwner = () => "mouse" as const;

/** The game owns transitions; battle lessons expose one explicit continue target. */
export function StarCardsTutorialOverlay({ stage, visible, root, inputMode, paused = false,
  targets, message, stepLabel, initialFocusLane, onContinue, focusStack = false }: {
  stage: StarCardsTutorialStage | null;
  /** Tips and the spotlight appear together whenever their stage is active. */
  visible: boolean;
  focusStack?: boolean;
  root: RefObject<HTMLElement | null>;
  inputMode: "keyboard-mouse" | "gamepad" | "mobile";
  paused?: boolean;
  targets?: Partial<Selectors>;
  message?: string;
  stepLabel?: string;
  initialFocusLane?: "A" | "B" | "C" | null;
  onContinue?: () => void;
}) {
  const id = useId().replace(/:/g, "");
  const tipElement = useRef<HTMLElement | null>(null);
  const naturalText = useRef<HTMLSpanElement | null>(null);
  const baselineText = useRef<HTMLSpanElement | null>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const owner = useSyncExternalStore(subscribeToCursorOwner, getCursorOwner, getServerCursorOwner);
  // Keep the original hand footprint while cards leave it, are dragged, or float.
  // Root-relative coordinates preserve that footprint through resize and scroll.
  const handFootprint = useRef<{ stage: StarCardsTutorialStage | null; rect: Rect | null }>({ stage: null, rect: null });
  // The spotlight may follow an animated control; the Tips window must not.
  const tipAnchor = useRef<{ stage: StarCardsTutorialStage | null; rect: Rect | null }>({ stage: null, rect: null });
  const firstTipPosition = useRef<{ centerX: number; top: number; bottom: number } | null>(null);
  const selectors = { ...DEFAULT_SELECTORS, ...targets };
  const { hand, zones, zone2, draw, battle } = selectors;

  useLayoutEffect(() => {
    if (handFootprint.current.stage !== stage) handFootprint.current = { stage, rect: null };
    if (tipAnchor.current.stage !== stage) {
      tipAnchor.current = { stage, rect: null };
      setPlacement(null);
    }
    // A new drag changes only the spotlight. Keep the mounted Tip and its
    // measured position so its entrance animation never restarts within a step.
    if (!stage || paused) { setPlacement(null); return; }
    let frame = 0;
    let disposed = false;
    const measure = () => {
      if (disposed) return;
      const host = root.current;
      const hostRect = host?.getBoundingClientRect();
      if (host && hostRect && hostRect.width > 0 && hostRect.height > 0) {
        const read = (selector: string): Rect[] => Array.from(host.querySelectorAll<HTMLElement>(selector))
          .filter(element => element.getClientRects().length > 0)
          .map(element => element.getBoundingClientRect())
          .filter(rect => rect.width > 0 && rect.height > 0)
          .map(({ x, y, width, height }) => ({ x, y, width, height }));
        const cardRects = ["initial", "place", "choice", "risk"].includes(stage) ? read(hand) : [];
        if (!handFootprint.current.rect && cardRects.length) {
          const cards = union(cardRects)!;
          handFootprint.current.rect = {
            x: (cards.x - hostRect.x) / hostRect.width,
            y: (cards.y - hostRect.y) / hostRect.height,
            width: cards.width / hostRect.width,
            height: cards.height / hostRect.height,
          };
        }
        const normalized = handFootprint.current.rect;
        const cards = normalized ? {
          x: hostRect.x + normalized.x * hostRect.width,
          y: hostRect.y + normalized.y * hostRect.height,
          width: normalized.width * hostRect.width,
          height: normalized.height * hostRect.height,
        } : null;
        const button = stage === "draw" ? union(read(draw)) : stage === "battle" ? union(read(battle)) : null;
        const lessonCards = stage === "counter"
          ? read('.star-cards-lane[data-lane="B"] .star-card-shell[data-top-card="true"], .star-cards-advantage-panel')
          : stage === "recap" && focusStack ? read(".star-cards-stack-status")
          : stage === "score" ? read('.star-cards-score')
          : stage === "points" ? read('.star-cards-lane:not([data-lane="B"]) .star-card-shell[data-top-card="true"]')
          : stage === "choice" ? [union([...read(zones), ...(cards ? [cards] : []), ...read(hand)])!]
          : stage === "known" ? read('.star-cards-lane:is([data-lane="A"], [data-lane="B"]), .star-cards-lane.is-ai-lane:is([data-lane="A"], [data-lane="B"]) .star-card-shell[data-top-card="true"]')
          : stage === "risk" ? [...read('.star-cards-lane[data-lane="C"], .star-cards-lane[data-lane="C"] .star-card-shell[data-top-card="true"]'), ...read(hand)] : [];
        const initialTarget = stage === "initial" && initialFocusLane
          ? read(`.star-cards-lane.is-player-lane[data-lane="${initialFocusLane}"]`) : [];
        const focus = union(lessonCards) ?? (["recap", "encourage"].includes(stage) ? hostRect : null) ?? button ?? union([
          ...(cards ? [cards] : []), ...read(stage === "initial" ? zones : zone2),
        ]);
        const anchor = button ?? cards ?? focus;
        if (focus && anchor) {
          if (!tipAnchor.current.rect) {
            tipAnchor.current.rect = {
              x: (anchor.x - hostRect.x) / hostRect.width,
              y: (anchor.y - hostRect.y) / hostRect.height,
              width: anchor.width / hostRect.width,
              height: anchor.height / hostRect.height,
            };
          }
          const fixedAnchor = tipAnchor.current.rect;
          const anchorX = hostRect.x + fixedAnchor.x * hostRect.width;
          const anchorY = hostRect.y + fixedAnchor.y * hostRect.height;
          const anchorWidth = fixedAnchor.width * hostRect.width;
          const anchorHeight = fixedAnchor.height * hostRect.height;
          const viewport = { width: window.innerWidth, height: window.innerHeight };
          const padding = 12;
          const focusRects = (stage === "recap" && !focusStack) || stage === "encourage" ? [] : lessonCards.length ? lessonCards : initialTarget.length
            ? [...initialTarget, ...read('.star-card-shell.is-dragging, .star-card-shell.is-held')] : [focus];
          const holes = focusRects.map(rect => {
            const horizontalPadding = stage === "initial" && !initialTarget.length ? 48 : padding;
            const left = clamp(rect.x - horizontalPadding, 0, viewport.width);
            const top = clamp(rect.y - padding, 0, viewport.height);
            const right = clamp(rect.x + rect.width + horizontalPadding, left, viewport.width);
            const bottom = clamp(rect.y + rect.height + padding, top, viewport.height);
            return { x: left, y: top, width: right - left, height: bottom - top };
          });
          const compact = stage !== "initial";
          const availableWidth = Math.max(1, viewport.width - 24);
          let desiredWidth = TIP_DEFAULT_WIDTHS[stage];
          if (naturalText.current && baselineText.current) {
            // These hidden, unwrapped spans use the real rendered font. Their
            // longest explicit line determines width without sampling animation.
            desiredWidth += naturalText.current.offsetWidth - baselineText.current.offsetWidth;
            const footer = tipElement.current?.querySelector<HTMLElement>(".sct-tip-footer");
            if (footer) {
              const style = getComputedStyle(footer);
              const children = Array.from(footer.children) as HTMLElement[];
              const footerWidth = children.reduce((sum, child) => sum + child.offsetWidth, 0)
                + parseFloat(style.columnGap) * (children.length - 1)
                + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + 10;
              desiredWidth = Math.max(desiredWidth, footerWidth);
            }
          }
          const width = Math.min(Math.max(220, Math.ceil(desiredWidth)), 600, availableWidth);
          const height = tipElement.current?.getBoundingClientRect().height ?? (stage === "draw" || stage === "place" ? 130 : compact ? 120 : 138);
          const gap = 20;
          let y = anchorY - height - gap;
          let arrowDirection: "up" | "down" = "down";
          if (y < 12 && anchorY + anchorHeight + height + gap < viewport.height - 12) {
            y = anchorY + anchorHeight + gap;
            arrowDirection = "up";
          }
          let centerX = anchorX + anchorWidth / 2;
          y -= 10;
          if ((stage === "draw" || stage === "place") && firstTipPosition.current) {
            centerX = hostRect.x + firstTipPosition.current.centerX * hostRect.width;
            y = hostRect.y + firstTipPosition.current.top * hostRect.height;
            // The annotated Step 2 frame shares Step 1's bottom edge, not its top.
            if (stage === "draw") y = hostRect.y + firstTipPosition.current.bottom * hostRect.height - height;
            arrowDirection = "down";
          }
          if (["counter", "score", "points", "choice", "known", "risk", "recap", "encourage"].includes(stage)) {
            // The board gap stays fixed; cards and buttons may animate independently.
            centerX = hostRect.x + hostRect.width * (stage === "counter" ? .71 : .5);
            y = hostRect.y + hostRect.height * (stage === "score" ? .405 : .43) - height / 2;
          }
          const next: Placement = {
            holes,
            board: { x: hostRect.x, y: hostRect.y, width: hostRect.width, height: hostRect.height },
            tip: {
              x: clamp(centerX - width / 2, 12, viewport.width - width - 12),
              y: clamp(y, 12, viewport.height - height - 12), width, height, arrowDirection,
            }, viewport,
          };
          if (stage === "initial") {
            firstTipPosition.current = {
              centerX: (next.tip.x + width / 2 - hostRect.x) / hostRect.width,
              top: (next.tip.y - hostRect.y) / hostRect.height,
              bottom: (next.tip.y + height - hostRect.y) / hostRect.height,
            };
          }
          setPlacement(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
        } else setPlacement(previous => previous === null ? previous : null);
      } else setPlacement(previous => previous === null ? previous : null);
      frame = requestAnimationFrame(measure);
    };
    frame = requestAnimationFrame(measure);
    return () => { disposed = true; cancelAnimationFrame(frame); };
  }, [stage, root, paused, hand, zones, zone2, draw, battle, initialFocusLane, focusStack]);

  if (!stage || paused || !placement || typeof document === "undefined") return null;
  const { blackOpacity, holeBlurPx, fadeMs } = STARSHIP_CRAFTING_TUTORIAL_VISUALS;
  const placing = stage === "initial" || stage === "place" || stage === "risk";
  const cueMode = owner === "touch" || inputMode === "mobile" ? "mobile"
    : owner === "mouse" ? "mouse" : inputMode === "gamepad" ? "gamepad" : "keyboard";
  const operation = cueMode === "mobile" ? (placing ? "按住卡牌進行拖曳" : onContinue ? "點按提示繼續" : "點按按鈕繼續")
    : cueMode === "keyboard" ? (placing ? "Enter 選牌／放置" : "按 Enter 繼續")
      : cueMode === "gamepad" ? <>按 <GamepadButtonIcon button="A" /> {placing ? "選牌／放置" : "繼續"}</>
        : <>{placing ? "按住" : "按下"} <img className="star-cards-tutorial-input-icon"
          src={resolveRuntimePublicAssetUrl("ui/input/mouse-left.svg")} alt="滑鼠左鍵" draggable={false} /> {placing ? "進行拖曳" : "繼續"}</>;
  return createPortal(
    <div className="star-cards-tutorial-overlay" data-tutorial-stage={stage}
      data-tip-visible={visible} data-input-mode={inputMode} data-actionable={Boolean(onContinue)} data-owner={owner}
      style={{ "--star-cards-tutorial-fade": `${fadeMs}ms` } as CSSProperties}>
      {onContinue ? <div className="star-cards-tutorial-input-blocker" aria-hidden="true"
        style={{ left: placement.board.x, top: placement.board.y, width: placement.board.width, height: placement.board.height }} /> : null}
      {stage !== "encourage" ? <svg className="star-cards-tutorial-mask" viewBox={`0 0 ${placement.viewport.width} ${placement.viewport.height}`}
        preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <filter id={`star-cards-tutorial-blur-${id}`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation={holeBlurPx} />
          </filter>
          <mask id={`star-cards-tutorial-hole-${id}`} maskUnits="userSpaceOnUse" x="0" y="0"
            width={placement.viewport.width} height={placement.viewport.height}>
            <rect width={placement.viewport.width} height={placement.viewport.height} fill="white" />
            {placement.holes.map((hole, index) => <rect key={index} {...hole} rx="7" fill="black" filter={`url(#star-cards-tutorial-blur-${id})`} />)}
          </mask>
        </defs>
        <rect width={placement.viewport.width} height={placement.viewport.height}
          fill={`rgba(0,0,0,${blackOpacity})`} mask={`url(#star-cards-tutorial-hole-${id})`} />
      </svg> : null}
      {visible ? <aside key={stage} ref={tipElement} className={`sct-tip star-cards-tutorial-tip${stage !== "initial" ? " is-compact" : ""}`}
        role={onContinue ? "button" : "status"} tabIndex={onContinue ? 0 : undefined}
        aria-label={onContinue ? "確認教學並繼續結算" : undefined}
        onClick={onContinue} onKeyDown={event => {
          if (!onContinue || event.repeat || !["Enter", " "].includes(event.key)) return;
          event.preventDefault(); onContinue();
        }}
        aria-live="polite" aria-atomic="true"
        style={{ left: placement.tip.x, top: placement.tip.y, width: placement.tip.width }}>
        <div className="sct-tip-copy"><span className="sct-tip-text">{message ?? STAR_CARDS_TUTORIAL_MESSAGES[stage]}</span>
          <>
            <span ref={naturalText} className="star-cards-tutorial-text-measure" aria-hidden="true">{message ?? STAR_CARDS_TUTORIAL_MESSAGES[stage]}</span>
            <span ref={baselineText} className="star-cards-tutorial-text-measure" aria-hidden="true">{TIP_WIDTH_REFERENCE[stage]}</span>
          </>
        </div>
        <div className="sct-tip-footer"><span className="star-cards-tutorial-operation">{operation}</span>
          <span className="star-cards-tutorial-waiting">繼續STEP</span><b>{stepLabel ?? STEP_LABELS[stage]}</b>
          <i className="sct-tip-arrow" aria-hidden="true" data-direction={placement.tip.arrowDirection}><span /></i>
        </div>
      </aside> : null}
    </div>, document.body,
  );
}
