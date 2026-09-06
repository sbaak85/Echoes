import { GAMEPAD_GLYPHS, getGamepadGlyphUrl } from "./gamepad-glyph.ts";
import { resolveRuntimePublicAssetUrl } from "./public-asset-url.ts";

// Only actual runtime assets; reserve keyboard/mouse candidates are not loaded.
export function getUiWarmupUrls() {
  return [
    ...GAMEPAD_GLYPHS.map(getGamepadGlyphUrl),
    ...[
      "input/mouse-left.svg", "input/mouse-right.svg",
      "frequency-calibration/coarse-dial-knob.png",
      "frequency-calibration/current-band-frame.png",
      "frequency-calibration/fine-slider-rail-retro.png",
      "frequency-calibration/fine-slider-lever-retro.png",
      "power-devices/workbench-core-transparent.png",
    ].map(path => resolveRuntimePublicAssetUrl(`ui/${path}`)),
  ];
}

/** One low-priority decode at a time, never in an interaction handler. */
export function scheduleUiAssetWarmup(canWarm: () => boolean) {
  if (typeof window === "undefined") return () => {};
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (connection?.saveData) return () => {};
  const queue = getUiWarmupUrls();
  const retained: HTMLImageElement[] = [];
  let retainedBytes = 0;
  const budget = 32 * 1024 * 1024;
  let stopped = false;
  let timer = 0;
  let idle = 0;
  let pending: HTMLImageElement | null = null;
  const schedule = (delay = 100) => {
    if (!stopped && queue.length) timer = window.setTimeout(requestIdle, delay);
  };
  const run = async () => {
    idle = 0;
    if (stopped) return;
    if (document.hidden || !canWarm()) { schedule(1000); return; }
    const url = queue.shift();
    if (!url) return;
    const image = new Image();
    pending = image;
    image.decoding = "async";
    image.fetchPriority = "low";
    image.src = url;
    try {
      await image.decode();
      if (stopped) return;
      const bytes = image.naturalWidth * image.naturalHeight * 4;
      if (retainedBytes + bytes <= budget) {
        retained.push(image);
        retainedBytes += bytes;
      } else queue.length = 0;
    } catch {
      // Optional warmup never blocks the UI or replaces normal asset loading.
    } finally {
      pending = null;
      schedule();
    }
  };
  const requestIdle = () => {
    if (stopped) return;
    if (typeof window.requestIdleCallback === "function") {
      idle = window.requestIdleCallback(deadline => {
        if (deadline.timeRemaining() < 4) { schedule(250); return; }
        void run();
      });
    } else void run();
  };
  schedule(3000);
  return () => {
    stopped = true;
    window.clearTimeout(timer);
    if (idle && typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(idle);
    if (pending) pending.src = "";
    retained.length = 0;
    queue.length = 0;
  };
}
