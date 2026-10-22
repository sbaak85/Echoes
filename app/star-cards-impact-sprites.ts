// 由 output/star-cards-fx/bake-impacts.mjs 自動產生，請勿手動修改。
// 星際牌特效序列圖：橫向一條，每格為正方形、特效中心在正中央。
// boxCqw＝倍率 1 時，一格在牌桌上的邊長（cqw）；命中再乘 --fx-<武器>-hit-scale，平手再乘 --fx-tie-scale。
import type { StarCardAttribute } from "./star-cards-game.ts";

export type StarCardsImpactSprite = {
  frames: number;
  fps: number;
  durationMs: number;
  boxCqw: number;
  files: readonly string[];
};

/** 命中爆炸：每種武器 3 個版本 */
export const STAR_CARDS_IMPACT_SPRITES: Record<StarCardAttribute, StarCardsImpactSprite> = {
  laser: {
    frames: 36,
    fps: 30,
    durationMs: 1200,
    boxCqw: 14.93,
    files: [
      "fx/impact-laser-1.webp",
      "fx/impact-laser-2.webp",
      "fx/impact-laser-3.webp"
    ]
  },
  missile: {
    frames: 40,
    fps: 30,
    durationMs: 1333,
    boxCqw: 19.92,
    files: [
      "fx/impact-missile-1.webp",
      "fx/impact-missile-2.webp",
      "fx/impact-missile-3.webp"
    ]
  },
  shield: {
    frames: 25,
    fps: 30,
    durationMs: 833,
    boxCqw: 11.31,
    files: [
      "fx/impact-shield-1.webp",
      "fx/impact-shield-2.webp",
      "fx/impact-shield-3.webp"
    ]
  }
};

/** 平手氣爆（不含扭曲背景的氣壓波，那一層在遊戲中即時播放） */
export const STAR_CARDS_TIE_SPRITE: StarCardsImpactSprite = {
  frames: 25,
  fps: 30,
  durationMs: 833,
  boxCqw: 19.33,
  files: [
    "fx/tie-1.webp"
  ]
};
