export type MobileHudPanelMode = "mini" | "collapsed" | "expanded";
export type MobileHudModes = { survival: MobileHudPanelMode; quest: MobileHudPanelMode };

export function cycleMobileHudMode(current: MobileHudModes, panel: keyof MobileHudModes, canShare: boolean): MobileHudModes {
  const mode = current[panel];
  return changeMobileHudMode(current, panel, mode === "mini" ? "collapsed" : mode === "collapsed" ? "expanded" : "mini", canShare);
}

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
