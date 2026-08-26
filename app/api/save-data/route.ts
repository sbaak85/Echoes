import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  SAVE_DATA_MANUAL_SLOT_COUNT,
  getManualSaveSlotId,
  isSaveDataSlotId,
  normalizeEchoesSaveData,
  type SaveDataSlotId,
} from "../../save-data.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const saveRoot = path.resolve(process.env.ECHOES_SAVE_DATA_ROOT ?? path.join(process.cwd(), "SaveData"));
const backupRoot = path.join(saveRoot, "backups");
let writeQueue = Promise.resolve();

function slotPath(slotId: SaveDataSlotId) { return path.join(saveRoot, `${slotId}.json`); }
async function exists(filePath: string) {
  try { await access(filePath); return true; } catch { return false; }
}
async function readSlot(slotId: SaveDataSlotId) {
  return normalizeEchoesSaveData(JSON.parse(await readFile(slotPath(slotId), "utf8")));
}
function noStore(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store");
  return Response.json(body, { ...init, headers });
}

export async function GET(request: Request) {
  const slotParam = new URL(request.url).searchParams.get("slot");
  if (slotParam !== null) {
    if (!isSaveDataSlotId(slotParam)) return noStore({ error: "invalid-slot" }, { status: 400 });
    if (!(await exists(slotPath(slotParam)))) return noStore({ error: "empty-slot" }, { status: 404 });
    try {
      const save = await readSlot(slotParam);
      return save ? noStore({ save }) : noStore({ error: "corrupted-save" }, { status: 422 });
    } catch { return noStore({ error: "corrupted-save" }, { status: 422 }); }
  }

  const slotIds: SaveDataSlotId[] = [
    "autosave",
    ...Array.from({ length: SAVE_DATA_MANUAL_SLOT_COUNT }, (_, index) => getManualSaveSlotId(index + 1)),
  ];
  const slots = await Promise.all(slotIds.map(async (slotId) => {
    if (!(await exists(slotPath(slotId)))) return { slotId, exists: false, backend: "local-files" as const };
    try {
      const save = await readSlot(slotId);
      return save
        ? { slotId, exists: true, savedAt: save.savedAt, summary: save.summary, backend: "local-files" as const }
        : { slotId, exists: true, corrupted: true, backend: "local-files" as const };
    } catch { return { slotId, exists: true, corrupted: true, backend: "local-files" as const }; }
  }));
  return noStore({ slots });
}

export async function POST(request: Request) {
  let body: { slotId?: unknown; save?: unknown };
  try { body = await request.json(); } catch { return noStore({ error: "invalid-json" }, { status: 400 }); }
  if (!isSaveDataSlotId(body.slotId)) return noStore({ error: "invalid-slot" }, { status: 400 });
  const save = normalizeEchoesSaveData(body.save);
  if (!save) return noStore({ error: "invalid-save" }, { status: 400 });
  const slotId = body.slotId;
  const operation = async () => {
    await mkdir(backupRoot, { recursive: true });
    const target = slotPath(slotId);
    const temporary = path.join(saveRoot, `.${slotId}.${Date.now()}.tmp`);
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
    } finally { await rm(temporary, { force: true }); }
  };
  writeQueue = writeQueue.then(operation, operation);
  try { await writeQueue; return noStore({ ok: true }); }
  catch (error) {
    console.error("[Echoes SaveData] Route write failed:", error);
    return noStore({
      error: "write-failed",
      detail: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const slotParam = new URL(request.url).searchParams.get("slot");
  if (!isSaveDataSlotId(slotParam) || slotParam === "autosave") {
    return noStore({ error: "invalid-slot" }, { status: 400 });
  }
  const target = slotPath(slotParam);
  if (!(await exists(target))) return noStore({ ok: true });
  const operation = async () => {
    await mkdir(backupRoot, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    await rename(target, path.join(backupRoot, `${slotParam}-deleted-${stamp}.json`));
  };
  writeQueue = writeQueue.then(operation, operation);
  try { await writeQueue; return noStore({ ok: true }); }
  catch (error) {
    console.error("[Echoes SaveData] Route delete failed:", error);
    return noStore({
      error: "delete-failed",
      detail: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
