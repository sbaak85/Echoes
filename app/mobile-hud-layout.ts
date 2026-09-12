export type MobileHudPanelMode = "mini" | "collapsed" | "expanded";
export type MobileHudModes = { survival: MobileHudPanelMode; quest: MobileHudPanelMode };

export function canShareMobileHudSpace(available: number, survival: number, quest: number, gap: number) {
  return available >= survival + quest + gap;
}

export function changeMobileHudMode(
  current: MobileHudModes,
  panel: keyof MobileHudModes,
  mode: MobileHudPanelMode,
  canShare: boolean,
): MobileHudModes {
  const other = panel === "survival" ? "quest" : "survival";
  return { ...current, [panel]: mode, [other]: mode !== "mini" && !canShare ? "mini" : current[other] };
}
