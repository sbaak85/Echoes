/** 航線監測終端小遊戲：shipinterior-interaction-019 播完成功互動對話後啟動。 */
export const NAV_TERMINAL_INTERACTION_ID = "shipinterior-interaction-019";
export const NAV_TERMINAL_MESSAGE_CHANNEL = "echoes-nav-terminal";

/** 只接受三組 BLOCK 都校對完成的回報，不接受未帶結果的「完成」訊息。 */
export function isNavTerminalCleared(solved: unknown): boolean {
  return Array.isArray(solved) && solved.length === 3 &&
    ["A", "B", "C"].every((letter) => solved.includes(letter));
}
