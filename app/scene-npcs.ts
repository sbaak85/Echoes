import {
  evaluateInteractionStageRequirement,
  isInteractionRetired,
  type InteractionObjectiveState,
  type InteractionUseRequirement,
} from "./interaction-flow.ts";

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
export type NpcSprite = {
  file: string;
  width: number;
  height: number;
  anchorX: number;
  anchorY: number;
  bodyHeight: number;
};
export type NpcCatalog = {
  defaultHeight: number;
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

/** A malformed character or direction is omitted without breaking other scene assets. */
export function normalizeNpcCatalog(value: unknown): NpcCatalog {
  const raw = object(value);
  const catalog: NpcCatalog = { defaultHeight: 152, characters: Object.create(null) };
  if (!raw || raw.version !== 1) return catalog;
  if (finite(raw.defaultHeight) && raw.defaultHeight > 0) catalog.defaultHeight = raw.defaultHeight;
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
      validSprites[direction] = sprite as NpcSprite;
    }
    catalog.characters[character.id] = {
      name: typeof character.name === "string" ? character.name : character.id,
      sprites: validSprites,
    };
  }
  return catalog;
}

export function getSceneNpcRenderData(value: unknown, catalog: NpcCatalog) {
  const raw = object(value);
  if (!raw || typeof raw.characterId !== "string" || !finite(raw.x) || !finite(raw.y) ||
      !NPC_DIRECTIONS.includes(raw.facing as NpcDirection) || !finite(raw.scale) || raw.scale <= 0) return null;
  const npc = raw as SceneNpc;
  const sprite = catalog.characters[npc.characterId]?.sprites[npc.facing];
  if (!sprite) return null;
  const bodyHeight = catalog.defaultHeight * npc.scale;
  const pixelScale = bodyHeight / sprite.bodyHeight;
  const width = sprite.width * pixelScale, height = sprite.height * pixelScale;
  const left = npc.x - sprite.anchorX * pixelScale;
  const top = npc.y - sprite.anchorY * pixelScale;
  if (![bodyHeight, width, height, left, top].every(Number.isFinite)) return null;
  return { npc, sprite, bodyHeight, pixelScale, left, top, width, height };
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

/** Farther feet draw first. Keep equal-depth NPCs deterministic and the player on top. */
export function sortSceneActors<T extends { id: string; kind: "npc" | "player"; footY: number }>(actors: readonly T[]): T[] {
  return [...actors].sort((a, b) => a.footY - b.footY ||
    (a.kind === b.kind ? a.id.localeCompare(b.id) : a.kind === "npc" ? -1 : 1));
}
