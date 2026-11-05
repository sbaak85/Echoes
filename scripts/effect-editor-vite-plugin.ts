import { readFile, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

import { normalizeShipEffectsData, SHIP_EFFECTS_UPDATED_EVENT } from "../app/ship-fire.ts";

// 船艙火焰／火星／爆炸配置工具（只在開發伺服器提供，不會進正式版）
// - GET  /__effect-editor/            工具頁面（tools/effect-editor/index.html）
// - GET  /api/ship-effects            讀取 public/effects/ship_interior.effects.json
// - POST /api/ship-effects            檢查後寫回同一個檔案，並推送給開著的遊戲頁面直接套用
// - GET  /api/ship-effects/lines      第二章劇情對話的 lineId 清單（給工具的下拉選單）

const PAGE_PATH = "/__effect-editor/";
const API_PATH = "/api/ship-effects";
const LINES_PATH = "/api/ship-effects/lines";
const PAGE_FILE = fileURLToPath(new URL("../tools/effect-editor/index.html", import.meta.url));
const DATA_FILE = fileURLToPath(new URL("../public/effects/ship_interior.effects.json", import.meta.url));
const STORY_FILE = fileURLToPath(new URL("../app/story-content.ts", import.meta.url));

function sendJson(response: ServerResponse, statusCode: number, payload: unknown) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(payload));
}

async function readJsonBody(request: IncomingMessage) {
  let source = "";
  for await (const chunk of request) {
    source += chunk;
    if (source.length > 2 * 1024 * 1024) throw new Error("payload-too-large");
  }
  return JSON.parse(source) as unknown;
}

/** 從 story-content.ts 的 STORY_DIALOGUES 取出指定章節的台詞（lineId、說話者、內容） */
export function extractChapterLines(storySource: string, chapter: number) {
  const start = storySource.indexOf("export const STORY_DIALOGUES");
  const region = start >= 0 ? storySource.slice(start) : storySource;
  const prefix = `chapter${String(chapter).padStart(2, "0")}-`;
  const pattern = /"lineId":\s*"([^"]+)",\s*"speaker":\s*"((?:[^"\\]|\\.)*)",\s*"text":\s*"((?:[^"\\]|\\.)*)"/g;
  const lines: { lineId: string; speaker: string; text: string }[] = [];
  const seen = new Set<string>();
  for (const match of region.matchAll(pattern)) {
    const lineId = match[1];
    if (!lineId.startsWith(prefix) || seen.has(lineId)) continue;
    seen.add(lineId);
    lines.push({ lineId, speaker: JSON.parse(`"${match[2]}"`), text: JSON.parse(`"${match[3]}"`) });
  }
  return lines;
}

/** 從 story-content.ts 的 ChapterScriptEditor 原始資料取出指定章節的對話 ID（劇情多邊形台詞、劇情段落） */
export function extractChapterDialogues(storySource: string, chapter: number) {
  const match = storySource.match(/CHAPTER_SCRIPT_EDITOR_DATA_BEGIN\s+([A-Za-z0-9+/=\s]+?)\s*CHAPTER_SCRIPT_EDITOR_DATA_END/);
  if (!match) return [];
  const raw = JSON.parse(Buffer.from(match[1].replace(/\s+/g, ""), "base64").toString("utf8").replace(/^﻿/, "")) as {
    chapters?: { chapterNumber?: number; dialogueSections?: { id: string; name?: string }[]; storyTriggerDialogues?: { id: string; name?: string }[] }[];
  };
  const found = raw.chapters?.find((item) => item.chapterNumber === chapter);
  if (!found) return [];
  return [
    ...(found.storyTriggerDialogues ?? []).map((d) => ({ id: d.id, name: d.name ?? "", group: "storyTrigger" as const })),
    ...(found.dialogueSections ?? []).map((d) => ({ id: d.id, name: d.name ?? "", group: "section" as const })),
  ];
}

export function effectEditorPlugin(): Plugin {
  return {
    name: "echoes-effect-editor",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
        try {
          if (pathname === "/__effect-editor" || pathname === PAGE_PATH) {
            if (pathname === "/__effect-editor") {
              response.statusCode = 302;
              response.setHeader("Location", PAGE_PATH);
              response.end();
              return;
            }
            response.statusCode = 200;
            response.setHeader("Content-Type", "text/html; charset=utf-8");
            response.setHeader("Cache-Control", "no-store");
            response.end(await readFile(PAGE_FILE, "utf8"));
            return;
          }
          if (pathname === LINES_PATH) {
            const data = normalizeShipEffectsData(JSON.parse(await readFile(DATA_FILE, "utf8")));
            const story = await readFile(STORY_FILE, "utf8");
            sendJson(response, 200, {
              ok: true,
              lines: extractChapterLines(story, data.chapter),
              dialogues: extractChapterDialogues(story, data.chapter),
            });
            return;
          }
          if (pathname !== API_PATH) {
            next();
            return;
          }
          if (request.method === "GET") {
            sendJson(response, 200, { ok: true, data: normalizeShipEffectsData(JSON.parse(await readFile(DATA_FILE, "utf8"))) });
            return;
          }
          if (request.method !== "POST") {
            sendJson(response, 405, { ok: false, message: "只接受 GET 或 POST。" });
            return;
          }
          let data;
          try {
            data = normalizeShipEffectsData(await readJsonBody(request));
          } catch (error) {
            sendJson(response, 400, { ok: false, message: error instanceof Error ? error.message : String(error) });
            return;
          }
          await writeFile(DATA_FILE, `${JSON.stringify(data, null, 2)}\n`, "utf8");
          // 開著的遊戲頁面直接套用新配置（不用重新整理）
          (server.environments?.client?.hot ?? server.ws).send({ type: "custom", event: SHIP_EFFECTS_UPDATED_EVENT, data });
          sendJson(response, 200, { ok: true, path: "public/effects/ship_interior.effects.json", data });
        } catch (error) {
          sendJson(response, 500, { ok: false, message: error instanceof Error ? error.message : String(error) });
        }
      });
    },
  };
}
