import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

import {
  SAVE_DATA_MANUAL_SLOT_COUNT,
  getManualSaveSlotId,
  isSaveDataSlotId,
  normalizeEchoesSaveData,
  type SaveDataSlotId,
} from "../app/save-data.ts";

const API_PATH = "/api/save-data";
const DEFAULT_SAVE_ROOT = fileURLToPath(new URL("../SaveData/", import.meta.url));
const MAX_BODY_BYTES = 5 * 1024 * 1024;

type NextFunction = (error?: unknown) => void;

function sendJson(response: ServerResponse, statusCode: number, payload: unknown) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(payload));
}

async function readJsonBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > MAX_BODY_BYTES) throw new Error("payload-too-large");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

async function exists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function errorDetail(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function createSaveDataFileApiHandler(saveRoot: string) {
  const resolvedSaveRoot = path.resolve(saveRoot);
  const backupRoot = path.join(resolvedSaveRoot, "backups");
  let writeQueue = Promise.resolve();

  const slotPath = (slotId: SaveDataSlotId) => path.join(resolvedSaveRoot, `${slotId}.json`);
  const readSlot = async (slotId: SaveDataSlotId) => (
    normalizeEchoesSaveData(JSON.parse(await readFile(slotPath(slotId), "utf8")))
  );
  const enqueue = (operation: () => Promise<void>) => {
    const queued = writeQueue.then(operation, operation);
    writeQueue = queued.catch(() => undefined);
    return queued;
  };

  return async (request: IncomingMessage, response: ServerResponse, next: NextFunction) => {
    const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
    if (requestUrl.pathname !== API_PATH) {
      next();
      return;
    }

    if (request.method === "GET") {
      const slotParam = requestUrl.searchParams.get("slot");
      if (slotParam !== null) {
        if (!isSaveDataSlotId(slotParam)) {
          sendJson(response, 400, { error: "invalid-slot" });
          return;
        }
        if (!(await exists(slotPath(slotParam)))) {
          sendJson(response, 404, { error: "empty-slot" });
          return;
        }
        try {
          const save = await readSlot(slotParam);
          sendJson(response, save ? 200 : 422, save ? { save } : { error: "corrupted-save" });
        } catch {
          sendJson(response, 422, { error: "corrupted-save" });
        }
        return;
      }

      const slotIds: SaveDataSlotId[] = [
        "autosave",
        ...Array.from(
          { length: SAVE_DATA_MANUAL_SLOT_COUNT },
          (_, index) => getManualSaveSlotId(index + 1),
        ),
      ];
      const slots = await Promise.all(slotIds.map(async (slotId) => {
        if (!(await exists(slotPath(slotId)))) {
          return { slotId, exists: false, backend: "local-files" as const };
        }
        try {
          const save = await readSlot(slotId);
          return save
            ? {
                slotId,
                exists: true,
                savedAt: save.savedAt,
                summary: save.summary,
                backend: "local-files" as const,
              }
            : { slotId, exists: true, corrupted: true, backend: "local-files" as const };
        } catch {
          return { slotId, exists: true, corrupted: true, backend: "local-files" as const };
        }
      }));
      sendJson(response, 200, { slots });
      return;
    }

    if (request.method === "POST") {
      let body: { slotId?: unknown; save?: unknown };
      try {
        body = await readJsonBody(request) as { slotId?: unknown; save?: unknown };
      } catch (error) {
        sendJson(response, errorDetail(error) === "payload-too-large" ? 413 : 400, {
          error: errorDetail(error) === "payload-too-large" ? "payload-too-large" : "invalid-json",
        });
        return;
      }
      if (!isSaveDataSlotId(body.slotId)) {
        sendJson(response, 400, { error: "invalid-slot" });
        return;
      }
      const save = normalizeEchoesSaveData(body.save);
      if (!save) {
        sendJson(response, 400, { error: "invalid-save" });
        return;
      }
      const slotId = body.slotId;
      try {
        await enqueue(async () => {
          await mkdir(backupRoot, { recursive: true });
          const target = slotPath(slotId);
          const temporary = path.join(resolvedSaveRoot, `.${slotId}.${Date.now()}.tmp`);
          const stamp = new Date().toISOString().replace(/[:.]/g, "-");
          const backup = slotId === "autosave"
            ? path.join(backupRoot, "autosave-previous.json")
            : path.join(backupRoot, `${slotId}-${stamp}.json`);
          let movedOriginal = false;
          try {
            await writeFile(temporary, `${JSON.stringify(save, null, 2)}\n`, "utf8");
            if (await exists(target)) {
              if (slotId === "autosave") await rm(backup, { force: true });
              await rename(target, backup);
              movedOriginal = true;
            }
            try {
              await rename(temporary, target);
            } catch (error) {
              if (movedOriginal && !(await exists(target))) await rename(backup, target);
              throw error;
            }
          } finally {
            await rm(temporary, { force: true });
          }
        });
        sendJson(response, 200, { ok: true, backend: "local-files" });
      } catch (error) {
        console.error("[Echoes SaveData] Failed to write local save:", error);
        sendJson(response, 500, { error: "write-failed", detail: errorDetail(error) });
      }
      return;
    }

    if (request.method === "DELETE") {
      const slotParam = requestUrl.searchParams.get("slot");
      if (!isSaveDataSlotId(slotParam) || slotParam === "autosave") {
        sendJson(response, 400, { error: "invalid-slot" });
        return;
      }
      const target = slotPath(slotParam);
      if (!(await exists(target))) {
        sendJson(response, 200, { ok: true });
        return;
      }
      try {
        await enqueue(async () => {
          await mkdir(backupRoot, { recursive: true });
          const stamp = new Date().toISOString().replace(/[:.]/g, "-");
          await rename(target, path.join(backupRoot, `${slotParam}-deleted-${stamp}.json`));
        });
        sendJson(response, 200, { ok: true, backend: "local-files" });
      } catch (error) {
        console.error("[Echoes SaveData] Failed to delete local save:", error);
        sendJson(response, 500, { error: "delete-failed", detail: errorDetail(error) });
      }
      return;
    }

    sendJson(response, 405, { error: "method-not-allowed" });
  };
}

export function saveDataFileApiPlugin(): Plugin {
  const saveRoot = process.env.ECHOES_SAVE_DATA_ROOT || DEFAULT_SAVE_ROOT;
  const handler = createSaveDataFileApiHandler(saveRoot);
  return {
    name: "echoes-save-data-file-api",
    apply: "serve",
    enforce: "pre",
    configureServer(server) {
      server.middlewares.use(handler);
    },
  };
}
