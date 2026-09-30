export async function runPhototropicInteractionFlow(
  play: (() => Promise<{ completed: boolean }>) | null,
  viewer: { showBackground: () => void; hideBackground: () => void; openPuzzle: () => Promise<boolean>; cancelPuzzle: () => void },
  complete: () => void,
) {
  try {
    viewer.showBackground();
    if (play && !(await play()).completed) return;
    // Acquire puzzle ownership before releasing the illustration's world-input lock.
    const dismissed = viewer.openPuzzle();
    viewer.hideBackground();
    if (await dismissed) complete();
  } finally {
    viewer.hideBackground();
    viewer.cancelPuzzle();
  }
}
