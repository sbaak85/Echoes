import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";

import type {
  PlayerShadowTuning,
  PlayerShadowTuningValue,
  PlayerVisualDirection,
  PlayerVisualProjectConfig,
} from "../app/player-visual-config";

const API_PATH = "/api/player-visual-config";
const TARGET_PATH = fileURLToPath(
  new URL("../app/player-visual-config.ts", import.meta.url),
);
const DIRECTIONS: PlayerVisualDirection[] = [
  "N",
  "NE",
  "E",
  "SE",
  "S",
  "SW",
  "W",
  "NW",
];

function readInteger(value: unknown, minimum: number, maximum: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const rounded = Math.round(numeric);
  return rounded >= minimum && rounded <= maximum ? rounded : null;
}

function normalizeShadowValue(source: unknown): PlayerShadowTuningValue | null {
  if (!source || typeof source !== "object") return null;
  const value = source as Partial<PlayerShadowTuningValue>;
  const ambientOffsetX = readInteger(value.ambientOffsetX, -80, 80);
  const ambientOffsetY = readInteger(value.ambientOffsetY, -80, 80);
  const bootOffsetX = readInteger(value.bootOffsetX, -80, 80);
  const bootOffsetY = readInteger(value.bootOffsetY, -80, 80);
  const widthPercent = readInteger(value.widthPercent, 50, 300);
  const heightPercent = readInteger(value.heightPercent, 50, 300);
  if (
    ambientOffsetX === null ||
    ambientOffsetY === null ||
    bootOffsetX === null ||
    bootOffsetY === null ||
    widthPercent === null ||
    heightPercent === null
  ) {
    return null;
  }
  return {
    ambientOffsetX,
    ambientOffsetY,
    bootOffsetX,
    bootOffsetY,
    widthPercent,
    heightPercent,
  };
}

function normalizeProjectConfig(source: unknown): PlayerVisualProjectConfig | null {
  if (!source || typeof source !== "object") return null;
  const candidate = source as Partial<PlayerVisualProjectConfig>;
  const speed = readInteger(candidate.speed, 100, 380);
  const size = readInteger(candidate.size, 90, 220);
  if (speed === null || size === null || !candidate.shadows) return null;

  const shadowSource = candidate.shadows as Partial<PlayerShadowTuning>;
  const shadows = {} as PlayerShadowTuning;
  for (const direction of DIRECTIONS) {
    const value = normalizeShadowValue(shadowSource[direction]);
    if (!value) return null;
    shadows[direction] = value;
  }
  return { speed, size, shadows };
}

function serializeProjectConfig(config: PlayerVisualProjectConfig) {
  const shadowLines = DIRECTIONS.map((direction) => {
    const value = config.shadows[direction];
    return `    ${direction}: { ambientOffsetX: ${value.ambientOffsetX}, ambientOffsetY: ${value.ambientOffsetY}, bootOffsetX: ${value.bootOffsetX}, bootOffsetY: ${value.bootOffsetY}, widthPercent: ${value.widthPercent}, heightPercent: ${value.heightPercent} },`;
  }).join("\n");

  return `/**
 * 角色表現的專案預設值。
 *
 * 本機開發時可在遊戲內由「Options → 進階」調整並寫回此檔案；
 * 寫入後請連同其他專案修改一起 Commit／Push。
 */
export const PLAYER_VISUAL_PROJECT_CONFIG = {
  speed: ${config.speed},
  size: ${config.size},
  shadows: {
${shadowLines}
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
`;
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  payload: Record<string, unknown>,
) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}

async function readJsonBody(request: IncomingMessage) {
  let source = "";
  for await (const chunk of request) {
    source += chunk;
    if (source.length > 64 * 1024) throw new Error("payload-too-large");
  }
  return JSON.parse(source) as unknown;
}

export function playerVisualConfigWriterPlugin(): Plugin {
  return {
    name: "echoes-player-visual-config-writer",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
        if (pathname !== API_PATH) {
          next();
          return;
        }
        if (request.method !== "POST") {
          sendJson(response, 405, { ok: false, message: "只接受 POST。" });
          return;
        }

        let source: unknown;
        try {
          source = await readJsonBody(request);
        } catch {
          sendJson(response, 400, {
            ok: false,
            message: "設定內容不是有效的 JSON。",
          });
          return;
        }

        const config = normalizeProjectConfig(source);
        if (!config) {
          sendJson(response, 400, {
            ok: false,
            message: "角色參數超出允許範圍或缺少方向資料。",
          });
          return;
        }

        try {
          await writeFile(TARGET_PATH, serializeProjectConfig(config), "utf8");
          sendJson(response, 200, {
            ok: true,
            path: "app/player-visual-config.ts",
            config,
          });
        } catch (error) {
          sendJson(response, 500, {
            ok: false,
            message: "無法寫入 app/player-visual-config.ts。",
            detail: error instanceof Error ? error.message : String(error),
          });
        }
      });
    },
  };
}
