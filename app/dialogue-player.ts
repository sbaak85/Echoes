import type { DialogueChoiceOutcome, InteractionDialogueChoice, InteractionDialogueScript } from "./interaction-flow";
import { normalizeDialogueChoice, resolveWeightedDialogueLines } from "./interaction-flow.ts";
import { buildDialogueHistoryView, canOpenDialogueHistory, type DialogueHistoryView } from "./dialogue-history.ts";

export type DialogueContext = { dialogue?: InteractionDialogueScript | null };
export type DialoguePlayback<T extends DialogueContext = DialogueContext> = {
  dialogueId: string; interactable: T; lineIndex: number; pageIndex: number; pages: string[];
  lastBgmCueLineId?: string; lastLineSeLineId?: string; onComplete?: (outcome?: DialogueChoiceOutcome) => void;
  /** 最後一句之後的對話選項；choosing＝選項視窗開啟中，choiceOutcome＝已選定（播放回應台詞中） */
  choice?: InteractionDialogueChoice | null; choosing?: boolean; choiceIndex?: number; choiceOutcome?: DialogueChoiceOutcome;
};
/** 對話選項視窗：選項文字與目前選取的索引；null＝沒有開啟 */
export type DialogueChoiceView = { options: string[]; selectedIndex: number } | null;
export type DialogueView = { speaker: string; text: string; canReview: boolean; dialogueId: string; lineId?: string } | null;
export type DialogueTyping = { characters: string[]; visibleCount: number; speaker: string; delayMilliseconds: number; timerId: number | null; resume: () => void };
type Cell<T> = { current: T };
type DialoguePlayerHost<T extends DialogueContext> = {
  playback: Cell<DialoguePlayback<T> | null>; typing: Cell<DialogueTyping | null>; historyOpen: Cell<boolean>;
  setView: (view: DialogueView) => void; setHistory: (view: DialogueHistoryView | null) => void;
  setChoice?: (view: DialogueChoiceView) => void; onChoiceMove?: () => void; onChoiceConfirm?: () => void;
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
    host.historyOpen.current = false; host.setHistory(null); stopTyping(); host.setChoice?.(null);
    host.playback.current = null; host.onClose?.(); host.setView(null);
  };
  const finish = () => {
    const playback = host.playback.current;
    const complete = playback?.onComplete, outcome = playback?.choiceOutcome;
    close(); complete?.(outcome);
  };
  const showChoice = (playback: DialoguePlayback<T>) => host.setChoice?.({
    options: playback.choice?.options.map(option => option.label) ?? [], selectedIndex: playback.choiceIndex ?? 0,
  });
  const openChoice = (playback: DialoguePlayback<T>) => {
    playback.choosing = true; playback.choiceIndex = 0; showChoice(playback);
  };
  /** 方向鍵／十字鍵移動選取（頭尾循環）；選項視窗沒開時回傳 false */
  const moveChoice = (delta: number) => {
    const playback = host.playback.current;
    if (!playback?.choosing || !playback.choice || host.historyOpen.current) return false;
    const count = playback.choice.options.length;
    playback.choiceIndex = ((playback.choiceIndex ?? 0) + delta + count) % count;
    host.onChoiceMove?.(); showChoice(playback); return true;
  };
  /** 滑鼠移到選項上時直接選取（只有一個選取狀態，不會跟方向鍵的選取同時出現） */
  const hoverChoice = (index: number) => {
    const playback = host.playback.current;
    if (!playback?.choosing || !playback.choice || index === playback.choiceIndex) return false;
    if (index < 0 || index >= playback.choice.options.length) return false;
    playback.choiceIndex = index; showChoice(playback); return true;
  };
  /** 確定選項：記住結果、關閉選項視窗，播放回應台詞（沒有就直接結束） */
  const confirmChoice = (index?: number) => {
    const playback = host.playback.current;
    if (!playback?.choosing || !playback.choice || host.historyOpen.current) return false;
    const option = playback.choice.options[index ?? playback.choiceIndex ?? 0];
    if (!option) return false;
    playback.choosing = false;
    playback.choiceOutcome = { choiceId: option.id, choiceAction: option.action ?? "continue" };
    host.onChoiceConfirm?.(); host.setChoice?.(null);
    const replies = resolveWeightedDialogueLines(option.replyLines?.filter(line => line.text.trim()) ?? []);
    if (replies.length === 0) { finish(); return true; }
    const dialogue = playback.interactable.dialogue;
    playback.interactable = { ...playback.interactable, dialogue: { ...dialogue, lines: replies } };
    playback.lineIndex = 0; playback.pageIndex = 0; playback.pages = splitDialoguePages(replies[0].text);
    showPage(playback); return true;
  };
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
  const present = (dialogueId: string, interactable: T, onComplete?: (outcome?: DialogueChoiceOutcome) => void, dialogue: InteractionDialogueScript | null | undefined = interactable.dialogue) => {
    host.historyOpen.current = false; host.setHistory(null); host.setChoice?.(null);
    const lines = resolveWeightedDialogueLines(dialogue?.lines?.filter(line => line.text.trim()) ?? []);
    const effectiveLines = lines.length > 0 ? lines : [{ speaker: "", text: "..." }];
    const playback: DialoguePlayback<T> = {
      dialogueId, interactable: { ...interactable, dialogue: {
        characterDelaySeconds: dialogue?.characterDelaySeconds ?? .02,
        speakers: dialogue?.speakers?.filter(speaker => speaker.trim()) ?? ["Sbaak", "Echo"], lines: effectiveLines,
      } }, lineIndex: 0, pageIndex: 0, pages: splitDialoguePages(effectiveLines[0].text), onComplete,
      choice: normalizeDialogueChoice(dialogue?.choice), choosing: false, choiceIndex: 0,
    };
    host.playback.current = playback; host.onStart?.(); showPage(playback);
  };
  const advance = () => {
    if (host.historyOpen.current) return true;
    const playback = host.playback.current; if (!playback) return false;
    // 選項視窗開啟中：確認／下一頁的按鍵（Enter、Space、E、手把 A）都當作選定目前的選項
    if (playback.choosing) return confirmChoice();
    const typing = host.typing.current;
    if (typing && typing.visibleCount < typing.characters.length) {
      if (typing.timerId !== null) host.clearTimer(typing.timerId);
      typing.visibleCount = typing.characters.length; typing.timerId = null; host.onTypingStop?.(); updateView(playback, typing); return true;
    }
    if (playback.pageIndex + 1 < playback.pages.length) { playback.pageIndex++; showPage(playback); return true; }
    const lines = playback.interactable.dialogue?.lines ?? [];
    if (playback.lineIndex + 1 < lines.length) { playback.lineIndex++; playback.pageIndex = 0; playback.pages = splitDialoguePages(lines[playback.lineIndex].text); showPage(playback); return true; }
    // 最後一句讀完：有選項且還沒選過就開啟選項視窗（最後一句保留在對話框中）
    if (playback.choice && !playback.choiceOutcome) { openChoice(playback); return true; }
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
    moveChoice, hoverChoice, confirmChoice, isChoosing: () => Boolean(host.playback.current?.choosing),
    toggleHistory: () => host.historyOpen.current ? closeHistory() : openHistory() };
}
