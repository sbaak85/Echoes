/**
 * 角色表現的專案預設值。
 *
 * 本機開發時可在遊戲內由「Options → 進階」調整並寫回此檔案；
 * 寫入後請連同其他專案修改一起 Commit／Push。
 */
export const PLAYER_VISUAL_PROJECT_CONFIG = {
  speed: 220,
  size: 152,
  shadows: {
    N: { ambientOffsetX: 0, ambientOffsetY: -6, bootOffsetX: 0, bootOffsetY: -6, widthPercent: 170, heightPercent: 200 },
    NE: { ambientOffsetX: 0, ambientOffsetY: -13, bootOffsetX: 0, bootOffsetY: -7, widthPercent: 180, heightPercent: 200 },
    E: { ambientOffsetX: 0, ambientOffsetY: -5, bootOffsetX: 0, bootOffsetY: -5, widthPercent: 180, heightPercent: 200 },
    SE: { ambientOffsetX: 0, ambientOffsetY: -18, bootOffsetX: -4, bootOffsetY: -11, widthPercent: 180, heightPercent: 200 },
    S: { ambientOffsetX: 0, ambientOffsetY: -6, bootOffsetX: 0, bootOffsetY: -6, widthPercent: 170, heightPercent: 200 },
    SW: { ambientOffsetX: 0, ambientOffsetY: -13, bootOffsetX: 0, bootOffsetY: -8, widthPercent: 180, heightPercent: 200 },
    W: { ambientOffsetX: 0, ambientOffsetY: -5, bootOffsetX: 0, bootOffsetY: -5, widthPercent: 180, heightPercent: 200 },
    NW: { ambientOffsetX: 0, ambientOffsetY: -13, bootOffsetX: 0, bootOffsetY: -3, widthPercent: 180, heightPercent: 200 },
  },
} as const;

export type PlayerVisualDirection = keyof typeof PLAYER_VISUAL_PROJECT_CONFIG.shadows;
export type PlayerShadowTuningValue = {
  ambientOffsetX: number;
  ambientOffsetY: number;
  bootOffsetX: number;
  bootOffsetY: number;
  widthPercent: number;
  heightPercent: number;
};
export type PlayerShadowTuning = Record<PlayerVisualDirection, PlayerShadowTuningValue>;
export type PlayerVisualProjectConfig = {
  speed: number;
  size: number;
  shadows: PlayerShadowTuning;
};
