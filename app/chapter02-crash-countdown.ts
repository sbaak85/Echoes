// 第二章墜落倒數：chapter02-section-13 播完 1 秒後出現，展開動畫刷完後從 06:00:00（分:秒:百分秒）開始倒數。
// 對話、劇情演出與選單開啟時暫停；chapter02-section-16 開始播放時停止；歸零時 Game Over，
// 重試會讀回倒數出現當下存下的檢查點。

/** 播完這段對話後出現倒數 */
export const CHAPTER02_COUNTDOWN_TRIGGER_DIALOGUE = "chapter02-section-13";
/** 這段對話開始播放時停止倒數（之後改成拾取道具後播放） */
export const CHAPTER02_COUNTDOWN_STOP_DIALOGUE = "chapter02-section-16";
export const CHAPTER02_COUNTDOWN_START_MS = 6 * 60 * 1000;
export const CHAPTER02_COUNTDOWN_DELAY_MS = 1000;

/** 刷出動畫的時間軸（毫秒，從出現開始算）；數字定格時才開始倒數 */
export const CHAPTER02_COUNTDOWN_INTRO = {
  /** 中央光線左右拉開 */
  lineMs: 160,
  /** 光線分成上下兩條，往上下伸展出整個框 */
  openMs: 280,
  scrambleTailMs: 140,
  popMs: 180,
  holdCenterMs: 1000,
  dockMs: 520,
} as const;
export const CHAPTER02_COUNTDOWN_FREEZE_AT_MS =
  CHAPTER02_COUNTDOWN_INTRO.lineMs + CHAPTER02_COUNTDOWN_INTRO.openMs + CHAPTER02_COUNTDOWN_INTRO.scrambleTailMs;
export const CHAPTER02_COUNTDOWN_DOCK_AT_MS =
  CHAPTER02_COUNTDOWN_FREEZE_AT_MS + CHAPTER02_COUNTDOWN_INTRO.popMs + CHAPTER02_COUNTDOWN_INTRO.holdCenterMs;
/** 最後幾毫秒框線急促閃動 */
export const CHAPTER02_COUNTDOWN_CRITICAL_MS = 60_000;

/** 倒數已出現（存檔中） */
export const CHAPTER02_COUNTDOWN_ACTIVE_FLAG = "chapter02-countdown-active";
/** section-16 開始後停止（存檔中） */
export const CHAPTER02_COUNTDOWN_STOPPED_FLAG = "chapter02-countdown-stopped";
/** StoryProgress.storyTimers 內的剩餘毫秒 */
export const CHAPTER02_COUNTDOWN_TIMER_ID = "chapter02-crash-countdown";
/** 倒數出現當下的完整存檔（剩 06:00:00），Game Over 重試時讀回 */
export const CHAPTER02_COUNTDOWN_CHECKPOINT_KEY = "echoes:chapter02-countdown-checkpoint:v1";
/** SurvivalGameState.gameOverReason：倒數歸零 */
export const CHAPTER02_CRASH_GAME_OVER_REASON = "crash" as const;
/** Game Over 背景插圖（暫用共用的 gameover.png，之後換成墜毀專用圖） */
export const CHAPTER02_CRASH_GAME_OVER_IMAGE = "gameover.png";

/** 倒數縮小上移後，剩下這個時間時自動播放的對話（播完才記錄，讀檔或中斷後會重播） */
export const CHAPTER02_COUNTDOWN_FOLLOW_UP_DIALOGUE = "chapter02-section-14";
/** 05:56:50（分:秒:百分秒） */
export const CHAPTER02_COUNTDOWN_FOLLOW_UP_AT_MS = (5 * 60 + 56) * 1000 + 500;
/** 倒數出現（刷出動畫開始）時播一次警報聲；Game Over 重試重播刷出時也會再播 */
export const CHAPTER02_COUNTDOWN_ALARM_EVENT = "chapter02EmergencyAlarm";
export const CHAPTER02_COUNTDOWN_FOLLOW_UP_DONE_FLAG = "chapter02-countdown-section-14-played";

export type Chapter02CountdownView = "hidden" | "intro" | "docked";

type CountdownStory = {
  currentChapter: number;
  storyFlags: Record<string, boolean>;
  storyTimers?: Record<string, number>;
};

export function getChapter02CountdownRemaining(story: CountdownStory) {
  const value = story.storyTimers?.[CHAPTER02_COUNTDOWN_TIMER_ID];
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(CHAPTER02_COUNTDOWN_START_MS, Math.max(0, value))
    : CHAPTER02_COUNTDOWN_START_MS;
}

/** 讀檔時的畫面：沒開始過不顯示；剛開始（或重試）重播刷出；跑到一半直接停在上方 */
export function resolveChapter02CountdownView(story: CountdownStory): Chapter02CountdownView {
  if (story.currentChapter !== 2 || story.storyFlags[CHAPTER02_COUNTDOWN_ACTIVE_FLAG] !== true) return "hidden";
  const remaining = getChapter02CountdownRemaining(story);
  if (story.storyFlags[CHAPTER02_COUNTDOWN_STOPPED_FLAG] !== true && remaining >= CHAPTER02_COUNTDOWN_START_MS) return "intro";
  return "docked";
}

export function isChapter02CountdownRunning(story: CountdownStory) {
  return story.currentChapter === 2 &&
    story.storyFlags[CHAPTER02_COUNTDOWN_ACTIVE_FLAG] === true &&
    story.storyFlags[CHAPTER02_COUNTDOWN_STOPPED_FLAG] !== true &&
    getChapter02CountdownRemaining(story) > 0;
}

export function withChapter02CountdownRemaining<T extends CountdownStory>(story: T, remainingMs: number): T {
  return {
    ...story,
    storyTimers: { ...story.storyTimers, [CHAPTER02_COUNTDOWN_TIMER_ID]: Math.max(0, Math.round(remainingMs)) },
  };
}

export function shouldPlayChapter02CountdownFollowUp(story: CountdownStory) {
  return isChapter02CountdownRunning(story) &&
    story.storyFlags[CHAPTER02_COUNTDOWN_FOLLOW_UP_DONE_FLAG] !== true &&
    getChapter02CountdownRemaining(story) <= CHAPTER02_COUNTDOWN_FOLLOW_UP_AT_MS;
}

/** 分:秒:百分秒，百分秒無條件進位，歸零前不會先顯示 00:00:00 */
export function formatChapter02Countdown(remainingMs: number) {
  const centiseconds = Math.max(0, Math.ceil(remainingMs / 10));
  const pad = (value: number) => String(value).padStart(2, "0");
  return {
    minutes: pad(Math.floor(centiseconds / 6000)),
    seconds: pad(Math.floor(centiseconds / 100) % 60),
    centiseconds: pad(centiseconds % 100),
  };
}
