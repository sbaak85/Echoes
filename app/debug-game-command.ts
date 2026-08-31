export type DebugGameCommand = {
  gameNumber: number;
};

export const isDebugGameCommand = (command: string) =>
  /^\s*game(?:\s+.*)?$/i.test(command);

export const isDebugDeathCommand = (command: string) =>
  /^\s*dead\s*$/i.test(command);

export const parseDebugGameCommand = (command: string): DebugGameCommand | null => {
  const match = /^\s*game\s+(\d+)\s*$/i.exec(command);
  if (!match) return null;
  return { gameNumber: Number.parseInt(match[1], 10) };
};
