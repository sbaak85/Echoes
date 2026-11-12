// 序章插圖預載：線上版（GitHub Pages）每張插圖 2～3 MB，播放到才下載會晚一拍才出現。
// 章節選單一出現就依播放順序逐張下載並解碼（一次只下載一張，第一張最先好、也不會塞爆頻寬）；
// 選第二章／第三章時停止後續預載，把頻寬讓給地圖與遊戲模組。
import { PROLOGUE_ILLUSTRATIONS } from "./prologue-flow.ts";
import { resolveRuntimePublicAssetUrl } from "./public-asset-url.ts";

/** 播放時等待插圖載入的上限：網路太慢時不會一直卡在黑畫面 */
export const PROLOGUE_ILLUSTRATION_LOAD_TIMEOUT_MS = 10000;

const loads = new Map<string, Promise<void>>();
/** 留住 Image 物件，瀏覽器才會保留已解碼的圖片，顯示時不用重新解碼 */
const retained: HTMLImageElement[] = [];
let queueToken = 0;
let queueRunning = false;

/** 載入並解碼一張插圖；同一張只下載一次。載入失敗也會 resolve（播放時照常顯示，交給 <img> 自己處理） */
export function loadPrologueIllustration(src: string): Promise<void> {
  const cached = loads.get(src);
  if (cached) return cached;
  if (typeof Image === "undefined") return Promise.resolve();
  const image = new Image();
  image.decoding = "async";
  const loaded = new Promise<void>((resolve) => {
    image.onload = () => resolve();
    image.onerror = () => resolve();
  }).then(() => image.decode?.().catch(() => {}));
  image.src = src;
  retained.push(image);
  loads.set(src, loaded);
  return loaded;
}

export function getPrologueIllustrationSources(): string[] {
  return PROLOGUE_ILLUSTRATIONS.map((item) => resolveRuntimePublicAssetUrl(item.imagePath));
}

/** 依播放順序逐張預載序章插圖（重複呼叫不會重複下載；停止後再呼叫會從尚未完成的那張接著載） */
export function preloadPrologueIllustrations(): void {
  if (queueRunning) return;
  queueRunning = true;
  const token = ++queueToken;
  void (async () => {
    for (const src of getPrologueIllustrationSources()) {
      if (token !== queueToken) return;
      await loadPrologueIllustration(src);
    }
    if (token === queueToken) queueRunning = false;
  })();
}

/** 停止尚未開始的預載（已在下載中的那一張會載完） */
export function stopPrologueIllustrationPreload(): void {
  queueToken += 1;
  queueRunning = false;
}
