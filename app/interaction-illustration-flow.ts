export async function runInteractionIllustrationFlow(
  concurrent: boolean,
  playDialogue: (() => Promise<{ completed: boolean }>) | null,
  viewer: { open: (concurrent: boolean) => Promise<boolean>; close: () => Promise<boolean>; cancel: () => void },
  complete: () => void,
) {
  try {
    if (concurrent && playDialogue) {
      const dismissed = viewer.open(true);
      const result = await playDialogue();
      if (!result.completed) { viewer.cancel(); return; }
      await viewer.close();
      if (await dismissed) complete();
    } else {
      if (playDialogue && !(await playDialogue()).completed) return;
      if (await viewer.open(false)) complete();
    }
  } catch (error) {
    viewer.cancel();
    throw error;
  }
}
