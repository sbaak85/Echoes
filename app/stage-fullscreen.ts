// 遊戲舞台（.game-shell）是否該撐滿整個畫面（加上 .is-fullscreen）。
// 瀏覽器真正的全螢幕（Fullscreen API），或 PC 按 F11（視窗與螢幕同大、沒有工具列）都算。
// 第二章以後的遊戲（movement-lab）與序章畫面（prologue-player）共用同一套判斷。

/** 與 movement-lab 的 MOBILE_HUD_MEDIA_QUERY 相同：手機版不用「畫面等於螢幕」判斷 F11 */
const MOBILE_LAYOUT_MEDIA_QUERY = "(max-width: 680px), (hover: none) and (pointer: coarse)";

export function isDocumentFullscreen(doc: Document = document) {
  const webkitDocument = doc as Document & { webkitFullscreenElement?: Element | null };
  return Boolean(doc.fullscreenElement || webkitDocument.webkitFullscreenElement);
}

/** PC 按 F11：瀏覽器工具列隱藏、可視區域等於螢幕大小 */
export function isViewportMatchingScreen(win: Window = window) {
  const browserToolbarHidden = Math.abs(win.outerHeight - win.innerHeight) <= 48;
  return browserToolbarHidden &&
    win.innerWidth >= Math.min(win.screen.width, win.screen.availWidth) - 20 &&
    (
      win.innerHeight >= win.screen.height - 20 ||
      win.innerHeight >= win.screen.availHeight - 20
    );
}

/**
 * 手機版只認瀏覽器真正的全螢幕（或呼叫端自己的替代模式 fallback）；
 * 「畫面等於螢幕大小」只用來偵測 PC 的 F11，手機套用會誤判（例如加到主畫面時）
 */
export function detectStageFullscreen(options: { fallback?: boolean; mobileLayout?: boolean } = {}) {
  if (typeof window === "undefined") return false;
  const mobileLayout = options.mobileLayout ?? window.matchMedia(MOBILE_LAYOUT_MEDIA_QUERY).matches;
  return Boolean(
    isDocumentFullscreen() ||
    options.fallback ||
    (!mobileLayout && isViewportMatchingScreen())
  );
}

/** 監聽會改變全螢幕狀態的事件；回傳解除函式 */
export function subscribeStageFullscreenChanges(onChange: () => void) {
  window.addEventListener("resize", onChange);
  window.addEventListener("orientationchange", onChange);
  window.visualViewport?.addEventListener("resize", onChange);
  document.addEventListener("fullscreenchange", onChange);
  document.addEventListener("webkitfullscreenchange", onChange);
  return () => {
    window.removeEventListener("resize", onChange);
    window.removeEventListener("orientationchange", onChange);
    window.visualViewport?.removeEventListener("resize", onChange);
    document.removeEventListener("fullscreenchange", onChange);
    document.removeEventListener("webkitfullscreenchange", onChange);
  };
}
