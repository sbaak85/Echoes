import {
  evaluateInteractionStageRequirement,
  isInteractionRetired,
  type InteractionObjectiveState,
  type InteractionUseRequirement,
} from "./interaction-flow.ts";
import type { BootShadowAnchor } from "./boot-shadow-tracking.ts";

export const NPC_DIRECTIONS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
export type NpcDirection = typeof NPC_DIRECTIONS[number];

/** Position is the actual ground-contact anchor, not the PNG's top-left corner. */
export type SceneNpc = {
  characterId: string;
  x: number;
  y: number;
  facing: NpcDirection;
  scale: number;
};
/**
 * 場景中的獨立 NPC（場景 JSON 的 `npcs`）。對話互動區以 `npcId` 引用，
 * 同一個角色可以被多段對話共用；出場／離場由 `presence` 自己決定，不再跟著某一段對話。
 */
export type SceneNpcDefinition = SceneNpc & {
  id: string;
  label: string;
  /** 出場條件（questStage 需求，可設關閉／移除條件）。沒有設定＝一直在場。 */
  presence: unknown | null;
  /** 對話時轉向主角，結束後轉回原本面向（預設開啟） */
  facePlayer: boolean;
  /** 待機呼吸（預設開啟） */
  breathing: boolean;
  /** 舊格式（互動區內嵌 npc）轉換而來：沿用所屬互動區的條件決定是否在場 */
  legacyRequirements?: unknown;
};
export type NpcSprite = {
  file: string;
  width: number;
  height: number;
  anchorX: number;
  anchorY: number;
  bodyHeight: number;
  bodyBounds: { x: number; y: number; width: number; height: number };
  bootAnchors: [BootShadowAnchor, BootShadowAnchor] | null;
};
export type NpcCatalog = {
  defaultHeight: number;
  /** 主角站立圖「可見身高／裁切框高度」：NPC 100% 時與主角同高 */
  bodyRatio: Record<NpcDirection, number>;
  characters: Record<string, { name: string; sprites: Partial<Record<NpcDirection, NpcSprite>> }>;
};
export type NpcStageQuery = {
  isQuestAtStage: (questId: string, stageId: string) => boolean;
  hasQuestReachedStage: (questId: string, stageId: string) => boolean;
  hasObjectiveReachedState: (questId: string, objectiveId: string, state: InteractionObjectiveState) => boolean;
};

const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const ratio = (value: unknown) => finite(value) && value >= 0 && value <= 1;
const isDirection = (value: unknown): value is NpcDirection => NPC_DIRECTIONS.includes(value as NpcDirection);

function normalizeBootAnchors(value: unknown): NpcSprite["bootAnchors"] {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const anchors = value.map(object);
  if (!anchors.every(anchor => anchor && ratio(anchor.xRatio) && ratio(anchor.yRatio) && ratio(anchor.contact))) return null;
  return anchors.map(anchor => ({ xRatio: anchor!.xRatio as number, yRatio: anchor!.yRatio as number,
    contact: anchor!.contact as number })) as [BootShadowAnchor, BootShadowAnchor];
}

/** A malformed character or direction is omitted without breaking other scene assets. */
export function normalizeNpcCatalog(value: unknown): NpcCatalog {
  const raw = object(value);
  const catalog: NpcCatalog = {
    defaultHeight: 152,
    bodyRatio: Object.fromEntries(NPC_DIRECTIONS.map(direction => [direction, 1])) as Record<NpcDirection, number>,
    characters: Object.create(null),
  };
  if (!raw || (raw.version !== 1 && raw.version !== 2)) return catalog;
  if (finite(raw.defaultHeight) && raw.defaultHeight > 0) catalog.defaultHeight = raw.defaultHeight;
  const bodyRatio = object(object(raw.reference)?.bodyRatio);
  for (const direction of NPC_DIRECTIONS) {
    const value = bodyRatio?.[direction];
    if (finite(value) && value > 0.5 && value <= 1) catalog.bodyRatio[direction] = value;
  }
  for (const candidate of Array.isArray(raw.characters) ? raw.characters : []) {
    const character = object(candidate), sprites = object(character?.sprites);
    if (!character || typeof character.id !== "string" || !/^[a-z][a-z0-9_-]*$/.test(character.id) || !sprites) continue;
    const validSprites: Partial<Record<NpcDirection, NpcSprite>> = {};
    for (const direction of NPC_DIRECTIONS) {
      const sprite = object(sprites[direction]);
      if (!sprite || typeof sprite.file !== "string" || !sprite.file.startsWith("characters/idle/") ||
          sprite.file.includes("..") || /[\\?#]/.test(sprite.file) || !sprite.file.endsWith(".png") ||
          !finite(sprite.width) || sprite.width <= 0 || !finite(sprite.height) || sprite.height <= 0 ||
          !finite(sprite.anchorX) || sprite.anchorX < 0 || sprite.anchorX > sprite.width ||
          !finite(sprite.anchorY) || sprite.anchorY < 0 || sprite.anchorY > sprite.height ||
          !finite(sprite.bodyHeight) || sprite.bodyHeight <= 0 || sprite.bodyHeight > sprite.height) continue;
      const bounds = object(sprite.bodyBounds);
      const bodyBounds = bounds && finite(bounds.x) && finite(bounds.y) && finite(bounds.width) && finite(bounds.height) &&
        bounds.width > 0 && bounds.height > 0
        ? { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
        // 舊目錄沒有身體範圍：以腳底為中心、可見身高為高度推估
        : { x: sprite.anchorX - sprite.bodyHeight * 0.17, y: sprite.anchorY - sprite.bodyHeight,
            width: sprite.bodyHeight * 0.34, height: sprite.bodyHeight };
      validSprites[direction] = {
        file: sprite.file, width: sprite.width, height: sprite.height,
        anchorX: sprite.anchorX, anchorY: sprite.anchorY, bodyHeight: sprite.bodyHeight,
        bodyBounds, bootAnchors: normalizeBootAnchors(sprite.bootAnchors),
      };
    }
    catalog.characters[character.id] = {
      name: typeof character.name === "string" ? character.name : character.id,
      sprites: validSprites,
    };
  }
  return catalog;
}

function normalizeNpcBody(raw: Record<string, unknown>): SceneNpc | null {
  if (typeof raw.characterId !== "string" || !finite(raw.x) || !finite(raw.y) ||
      !isDirection(raw.facing) || !finite(raw.scale) || raw.scale <= 0) return null;
  return { characterId: raw.characterId.trim(), x: raw.x, y: raw.y, facing: raw.facing, scale: raw.scale };
}

/**
 * 讀取場景的 NPC：新格式 `npcs` 清單＋互動區的 `npcId` 綁定。
 * 舊格式（互動區內嵌 `npc`）會轉成 `npc-<互動區ID>` 並沿用該互動區的條件，舊存檔與舊場景照常顯示。
 */
export function collectSceneNpcs(scene: { npcs?: unknown; interactables?: readonly unknown[] }) {
  const npcs = new Map<string, SceneNpcDefinition>();
  const bindings = new Map<string, string>();
  for (const candidate of Array.isArray(scene.npcs) ? scene.npcs : []) {
    const raw = object(candidate);
    const body = raw && normalizeNpcBody(raw);
    if (!raw || !body || typeof raw.id !== "string" || !raw.id.trim() || npcs.has(raw.id.trim())) continue;
    const id = raw.id.trim();
    npcs.set(id, {
      ...body, id,
      label: typeof raw.label === "string" && raw.label.trim() ? raw.label.trim() : id,
      presence: object(raw.presence),
      facePlayer: raw.facePlayer !== false,
      breathing: raw.breathing !== false,
    });
  }
  for (const candidate of scene.interactables ?? []) {
    const interactable = object(candidate);
    if (!interactable || typeof interactable.id !== "string") continue;
    if (typeof interactable.npcId === "string" && npcs.has(interactable.npcId.trim())) {
      bindings.set(interactable.id, interactable.npcId.trim());
      continue;
    }
    const legacy = object(interactable.npc), body = legacy && normalizeNpcBody(legacy);
    if (!body) continue;
    const id = `npc-${interactable.id}`;
    if (!npcs.has(id)) {
      npcs.set(id, { ...body, id, label: typeof interactable.label === "string" ? interactable.label : id,
        presence: null, facePlayer: true, breathing: true, legacyRequirements: interactable.useRequirements ?? [] });
    }
    bindings.set(interactable.id, id);
  }
  return { npcs, bindings };
}

/** Closing an interaction keeps the actor present. Only its independent removal retires it. */
export function isSceneNpcVisible(requirements: readonly InteractionUseRequirement[], query: NpcStageQuery): boolean {
  if (isInteractionRetired(requirements, query.hasQuestReachedStage, query.hasObjectiveReachedState)) return false;
  return requirements.every(requirement => {
    if (requirement.kind !== "questStage" || requirement.scope === "interaction") return true;
    return evaluateInteractionStageRequirement(
      { ...requirement, disableQuestId: undefined, disableStageId: undefined },
      query.isQuestAtStage, query.hasQuestReachedStage, query.hasObjectiveReachedState,
    );
  });
}

/**
 * 獨立 NPC 的出場條件：沒有設定＝一直在場；
 * 有設定時，啟用條件成立才出場，「關閉」或「移除」條件成立就離場。
 */
export function isSceneNpcPresent(presence: readonly InteractionUseRequirement[], query: NpcStageQuery): boolean {
  return presence.every(requirement => requirement.kind !== "questStage" || (
    evaluateInteractionStageRequirement(requirement, query.isQuestAtStage, query.hasQuestReachedStage, query.hasObjectiveReachedState) &&
    !isInteractionRetired([requirement], query.hasQuestReachedStage, query.hasObjectiveReachedState)
  ));
}

/** 角色可見身高（世界像素）：100% 時與主角在同一方向的可見身高一致，並跟著主角大小設定變動 */
export function getNpcBodyHeight(catalog: NpcCatalog, facing: NpcDirection, scale: number, playerSize = catalog.defaultHeight) {
  return playerSize * catalog.bodyRatio[facing] * scale;
}

export function getSceneNpcRenderData(value: unknown, catalog: NpcCatalog, playerSize = catalog.defaultHeight) {
  const raw = object(value);
  const npc = raw && normalizeNpcBody(raw);
  if (!npc) return null;
  const sprite = catalog.characters[npc.characterId]?.sprites[npc.facing];
  if (!sprite || !finite(playerSize) || playerSize <= 0) return null;
  const bodyHeight = getNpcBodyHeight(catalog, npc.facing, npc.scale, playerSize);
  const pixelScale = bodyHeight / sprite.bodyHeight;
  const width = sprite.width * pixelScale, height = sprite.height * pixelScale;
  const left = npc.x - sprite.anchorX * pixelScale;
  const top = npc.y - sprite.anchorY * pixelScale;
  if (![bodyHeight, width, height, left, top].every(Number.isFinite)) return null;
  const body = {
    left: left + sprite.bodyBounds.x * pixelScale, top: top + sprite.bodyBounds.y * pixelScale,
    width: sprite.bodyBounds.width * pixelScale, height: sprite.bodyBounds.height * pixelScale,
  };
  return { npc, sprite, bodyHeight, pixelScale, left, top, width, height, body };
}

/** 點擊判定：角色可見身體範圍（左右各留一點餘裕，方便手指點選） */
export function isPointOnNpcBody(point: { x: number; y: number }, body: { left: number; top: number; width: number; height: number }, padding = 6) {
  return point.x >= body.left - padding && point.x <= body.left + body.width + padding &&
    point.y >= body.top - padding && point.y <= body.top + body.height + padding;
}

/** 從 NPC 看向目標的 8 方向（每 45° 一格，與角色圖的方向一致） */
export function facingToward(from: { x: number; y: number }, to: { x: number; y: number }, fallback: NpcDirection): NpcDirection {
  const dx = to.x - from.x, dy = to.y - from.y;
  if (Math.hypot(dx, dy) < 1) return fallback;
  // 0 = E，順時針（畫面 y 向下）
  const sector = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
  return (["E", "SE", "S", "SW", "W", "NW", "N", "NE"] as const)[((sector % 8) + 8) % 8];
}

/** 轉身時一次只轉 45°，從目前方向往目標方向走最短的一邊 */
export function stepFacing(current: NpcDirection, target: NpcDirection): NpcDirection {
  const ring = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
  const from = ring.indexOf(current), to = ring.indexOf(target);
  if (from === to) return current;
  const clockwise = (to - from + 8) % 8;
  return ring[(from + (clockwise <= 4 ? 1 : 7)) % 8];
}

/** 待機呼吸：垂直約 ±0.6%、水平反向微調，週期約 3.4 秒；每個角色用 ID 錯開節奏 */
export function getBreathingScale(id: string, timeMilliseconds: number) {
  let hash = 0;
  for (let index = 0; index < id.length; index++) hash = (hash * 31 + id.charCodeAt(index)) | 0;
  const phase = ((hash >>> 0) % 1000) / 1000 * Math.PI * 2;
  const period = 3200 + ((hash >>> 10) % 600);
  const wave = Math.sin(timeMilliseconds / period * Math.PI * 2 + phase);
  return { x: 1 - wave * 0.002, y: 1 + wave * 0.006 };
}

/** Farther feet draw first. Keep equal-depth NPCs deterministic and the player on top. */
export function sortSceneActors<T extends { id: string; kind: "npc" | "player"; footY: number }>(actors: readonly T[]): T[] {
  return [...actors].sort((a, b) => a.footY - b.footY ||
    (a.kind === b.kind ? a.id.localeCompare(b.id) : a.kind === "npc" ? -1 : 1));
}
