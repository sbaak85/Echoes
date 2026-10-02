import type { InteractionDialogueScript } from "./interaction-flow";
import { resolveWeightedDialogueLines } from "./interaction-flow.ts";
import { buildDialogueHistoryView, canOpenDialogueHistory, type DialogueHistoryView } from "./dialogue-history.ts";

export type DialogueContext = { dialogue?: InteractionDialogueScript | null };
export type DialoguePlayback<T extends DialogueContext = DialogueContext> = {
  dialogueId: string; interactable: T; lineIndex: number; pageIndex: number; pages: string[];
  lastBgmCueLineId?: string; lastLineSeLineId?: string; onComplete?: () => void;
};
export type DialogueView = { speaker: string; text: string; canReview: boolean; dialogueId: string; lineId?: string } | null;
export type DialogueTyping = { characters: string[]; visibleCount: number; speaker: string; delayMilliseconds: number; timerId: number | null; resume: () => void };
type Cell<T> = { current: T };
type DialoguePlayerHost<T extends DialogueContext> = {
  playback: Cell<DialoguePlayback<T> | null>; typing: Cell<DialogueTyping | null>; historyOpen: Cell<boolean>;
  setView: (view: DialogueView) => void; setHistory: (view: DialogueHistoryView | null) => void;
  setTimer: (callback: () => void, delay: number) => number; clearTimer: (timer: number) => void;
  onTypingStart?: (restart: boolean) => void; onTypingStop?: () => void;
  onLineSe?: (lineId: string) => void; onLineBgm?: (lineId: string) => void;
  onStart?: () => void; onClose?: () => void; onHistoryOpen?: () => void; onHistoryClose?: () => void;
};

// Extracted from MovementLab. Runtime and previews share pagination, punctuation
// grouping, typewriter timing, history pausing and exactly-once completion.
export function splitDialoguePages(text: string, maximumCharacters = 96) {
  const normalized = text.trim() || "...", pages: string[] = [];
  let remainder = normalized;
  while (remainder.length > maximumCharacters) {
    let cut = -1;
    for (const marker of ["。", "！", "？", "，", "、", " "]) {
      const index = remainder.lastIndexOf(marker, maximumCharacters);
      if (index >= Math.floor(maximumCharacters * .55)) { cut = index + 1; break; }
    }
    if (cut < 1) cut = maximumCharacters;
    pages.push(remainder.slice(0, cut).trim()); remainder = remainder.slice(cut).trim();
  }
  if (remainder) pages.push(remainder);
  return pages.length > 0 ? pages : ["..."];
}
export function splitDialogueRevealUnits(text: string) {
  const characters = Array.from(text), units: string[] = [];
  let pendingWhitespace = "";
  for (let index = 0; index < characters.length; index++) {
    const character = characters[index];
    if (/\s/u.test(character)) { pendingWhitespace += character; continue; }
    if (/\p{P}/u.test(character)) {
      let punctuation = character;
      while (index + 1 < characters.length && /\p{P}/u.test(characters[index + 1])) punctuation += characters[++index];
      units.push(pendingWhitespace + punctuation); pendingWhitespace = ""; continue;
    }
    units.push(pendingWhitespace + character); pendingWhitespace = "";
  }
  if (pendingWhitespace) { if (units.length) units[units.length - 1] += pendingWhitespace; else units.push(pendingWhitespace); }
  return units.length > 0 ? units : ["..."];
}

export function createDialoguePlayer<T extends DialogueContext>(host: DialoguePlayerHost<T>) {
  const stopTyping = () => {
    const typing = host.typing.current;
    if (typing?.timerId !== null && typing?.timerId !== undefined) host.clearTimer(typing.timerId);
    host.onTypingStop?.(); host.typing.current = null;
  };
  const pauseTyping = () => {
    const typing = host.typing.current;
    if (!typing || typing.timerId === null) return;
    host.clearTimer(typing.timerId); typing.timerId = null; host.onTypingStop?.();
  };
  const resumeTyping = () => { const typing = host.typing.current; if (typing && typing.visibleCount < typing.characters.length) typing.resume(); };
  const close = () => {
    host.historyOpen.current = false; host.setHistory(null); stopTyping();
    host.playback.current = null; host.onClose?.(); host.setView(null);
  };
  const finish = () => { const complete = host.playback.current?.onComplete; close(); complete?.(); };
  const updateView = (playback: DialoguePlayback<T>, typing: DialogueTyping) => host.setView({
    speaker: typing.speaker, text: typing.characters.slice(0, typing.visibleCount).join(""),
    canReview: canOpenDialogueHistory(playback.lineIndex, playback.interactable.dialogue?.lines.length ?? 0),
    dialogueId: playback.dialogueId, lineId: playback.interactable.dialogue?.lines[playback.lineIndex]?.lineId,
  });
  const showPage = (playback: DialoguePlayback<T>) => {
    const line = playback.interactable.dialogue?.lines[playback.lineIndex];
    if (!line) { finish(); return; }
    const lineId = line.lineId?.trim() ?? "";
    if (playback.lastLineSeLineId !== lineId) { playback.lastLineSeLineId = lineId; host.onLineSe?.(lineId); }
    if (lineId && playback.lastBgmCueLineId !== lineId) { playback.lastBgmCueLineId = lineId; host.onLineBgm?.(lineId); }
    stopTyping();
    const typing: DialogueTyping = {
      characters: splitDialogueRevealUnits(playback.pages[playback.pageIndex] ?? "..."), visibleCount: 0,
      speaker: line.speaker?.trim() ?? "", delayMilliseconds: Math.max(0, Math.min(2, playback.interactable.dialogue?.characterDelaySeconds ?? .02)) * 1000,
      timerId: null, resume: () => {},
    };
    host.typing.current = typing;
    const reveal = () => {
      if (host.typing.current !== typing) return;
      typing.visibleCount = Math.min(typing.characters.length, typing.visibleCount + 1); updateView(playback, typing);
      if (typing.visibleCount < typing.characters.length) typing.timerId = host.setTimer(reveal, typing.delayMilliseconds);
      else { typing.timerId = null; host.onTypingStop?.(); }
    };
    typing.resume = () => {
      if (host.typing.current !== typing || typing.timerId !== null || typing.visibleCount >= typing.characters.length) return;
      host.onTypingStart?.(false); typing.timerId = host.setTimer(reveal, Math.max(0, typing.delayMilliseconds));
    };
    if (typing.delayMilliseconds <= 0) { typing.visibleCount = typing.characters.length; updateView(playback, typing); }
    else { host.onTypingStart?.(true); reveal(); }
  };
  const present = (dialogueId: string, interactable: T, onComplete?: () => void, dialogue: InteractionDialogueScript | null | undefined = interactable.dialogue) => {
    host.historyOpen.current = false; host.setHistory(null);
    const lines = resolveWeightedDialogueLines(dialogue?.lines?.filter(line => line.text.trim()) ?? []);
    const effectiveLines = lines.length > 0 ? lines : [{ speaker: "", text: "..." }];
    const playback: DialoguePlayback<T> = {
      dialogueId, interactable: { ...interactable, dialogue: {
        characterDelaySeconds: dialogue?.characterDelaySeconds ?? .02,
        speakers: dialogue?.speakers?.filter(speaker => speaker.trim()) ?? ["Sbaak", "Echo"], lines: effectiveLines,
      } }, lineIndex: 0, pageIndex: 0, pages: splitDialoguePages(effectiveLines[0].text), onComplete,
    };
    host.playback.current = playback; host.onStart?.(); showPage(playback);
  };
  const advance = () => {
    if (host.historyOpen.current) return true;
    const playback = host.playback.current; if (!playback) return false;
    const typing = host.typing.current;
    if (typing && typing.visibleCount < typing.characters.length) {
      if (typing.timerId !== null) host.clearTimer(typing.timerId);
      typing.visibleCount = typing.characters.length; typing.timerId = null; host.onTypingStop?.(); updateView(playback, typing); return true;
    }
    if (playback.pageIndex + 1 < playback.pages.length) { playback.pageIndex++; showPage(playback); return true; }
    const lines = playback.interactable.dialogue?.lines ?? [];
    if (playback.lineIndex + 1 < lines.length) { playback.lineIndex++; playback.pageIndex = 0; playback.pages = splitDialoguePages(lines[playback.lineIndex].text); showPage(playback); return true; }
    finish(); return true;
  };
  const openHistory = () => {
    const playback = host.playback.current, lines = playback?.interactable.dialogue?.lines;
    if (!playback || !lines || host.historyOpen.current || !canOpenDialogueHistory(playback.lineIndex, lines.length)) return false;
    pauseTyping(); host.historyOpen.current = true; host.setHistory(buildDialogueHistoryView(playback.dialogueId, lines, playback.lineIndex)); host.onHistoryOpen?.(); return true;
  };
  const closeHistory = () => {
    if (!host.historyOpen.current) return false;
    host.historyOpen.current = false; host.setHistory(null); resumeTyping(); host.onHistoryClose?.(); return true;
  };
  return { present, advance, close, stopTyping, pauseTyping, resumeTyping, openHistory, closeHistory,
    toggleHistory: () => host.historyOpen.current ? closeHistory() : openHistory() };
}
