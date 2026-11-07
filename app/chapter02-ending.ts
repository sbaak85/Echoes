// 第二章結尾：駕駛座（shipinterior-interaction-026）播完 chapter02-section-18（迫降墜毀）後，
// 黑畫面淡入 2 秒、全黑停留 1 秒，再以「選擇第三章開始」相同的流程進入第三章
// （重新載入後章節選單不顯示，直接載入第三章場景並播放第三章開場）。

export const CHAPTER02_ENDING_DIALOGUE_ID = "chapter02-section-18";
export const CHAPTER02_ENDING_BLACKOUT = { fadeInMs: 2000, holdMs: 1000 } as const;

/** 重新載入後由章節選單（game-entry）讀取一次：直接開始指定章節，不顯示選單 */
export const CHAPTER_AUTO_START_STORAGE_KEY = "echoes:auto-start-chapter";
/** 章節選單在 HTML 解析時就先遮住（避免重新載入時閃出選單畫面）：<head> 內插入這個 id 的 <style> */
export const CHAPTER_AUTO_START_STYLE_ID = "chapter-handoff-style";
const CHAPTER_AUTO_START_CSS =
  ".chapter-entry{background:#000!important}.chapter-entry section{visibility:hidden}";

export type AutoStartChapter = 2 | 3;

type SessionStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function getSessionStore(): SessionStore | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function requestChapterAutoStart(chapter: AutoStartChapter, store = getSessionStore()) {
  try {
    store?.setItem(CHAPTER_AUTO_START_STORAGE_KEY, String(chapter));
    return Boolean(store);
  } catch {
    return false;
  }
}

/** 讀取並清除（只生效一次，之後手動重新整理會回到章節選單） */
export function takeChapterAutoStart(store = getSessionStore()): AutoStartChapter | null {
  try {
    const value = store?.getItem(CHAPTER_AUTO_START_STORAGE_KEY) ?? null;
    store?.removeItem(CHAPTER_AUTO_START_STORAGE_KEY);
    return value === "2" || value === "3" ? Number(value) as AutoStartChapter : null;
  } catch {
    return null;
  }
}

/** 遮住章節選單（全黑）；已遮住就不重複插入。不改 React 管理的元素屬性，避免水合不一致 */
export function showChapterHandoffCover(doc: Document = document) {
  if (doc.getElementById(CHAPTER_AUTO_START_STYLE_ID)) return;
  const style = doc.createElement("style");
  style.id = CHAPTER_AUTO_START_STYLE_ID;
  style.textContent = CHAPTER_AUTO_START_CSS;
  doc.head.appendChild(style);
}

export function hideChapterHandoffCover(doc: Document = document) {
  doc.getElementById(CHAPTER_AUTO_START_STYLE_ID)?.remove();
}

/** 內嵌在章節選單 HTML 的同步腳本：有交接標記時先插入全黑樣式（在 React 水合之前） */
export const CHAPTER_AUTO_START_INLINE_SCRIPT =
  `try{if(sessionStorage.getItem(${JSON.stringify(CHAPTER_AUTO_START_STORAGE_KEY)})` +
  `&&!document.getElementById(${JSON.stringify(CHAPTER_AUTO_START_STYLE_ID)})){` +
  `var s=document.createElement("style");s.id=${JSON.stringify(CHAPTER_AUTO_START_STYLE_ID)};` +
  `s.textContent=${JSON.stringify(CHAPTER_AUTO_START_CSS)};document.head.appendChild(s)}}catch(e){}`;
